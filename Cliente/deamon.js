// Deamon que es atacado por el cliente para recibir las peticiones de
// creación-destrucción de contenedores, y que se coordina con el resto de
// nodos del cluster por medio del servidor, que gestiona la base de datos "etcd"

const zmq = require('zeromq');
const { exec, spawn } = require('child_process');
const { existsSync } = require('fs');
const { mkdir } = require('fs/promises');
const { resolve } = require('path');


class Contenedor{
    constructor(nombre, IP, pid, netns, veth){
        this.nombre = nombre;
        this.IP = IP;
        this.pid = pid;
        this.netns = netns;
        this.veth = veth;
    }
}

class Deamon{
    constructor(miNombre, miIP, servidorIP, LAN, puertoServicio, puertoReq, puertoSub){
        // Variables que conserva el Deamon
        this.miNombre = miNombre;
        this.miIP = miIP;
        this.servidorIP = servidorIP;
        this.LAN = LAN;
        this.puertoServicio = puertoServicio;
        this.puertoReq = puertoReq;
        this.puertoSub = puertoSub;

        this.misContenedores = [];
        this.subred = '';
        this.bridgeIP = '';

        //sockets para servir al cliente y para conectarse al servidor

        //socket servicio
        this.socketServicio = zmq.socket('rep');
        this.socketServicio.bindSync(`tcp://*:${puertoServicio}`);
        console.log(`Sirviendo al cliente en el puerto ${puertoServicio}`);

        this.socketServicio.on('message', (metodo,argumentos) => {
            try{
                // Este truco con 0MQ ya permite tener un proxy universal
                metodo = metodo.toString();
                argumentos = argumentos.toString().split(',');

                console.log(`Peticion del cliente -> metodo: ${metodo}, argumentos: ${argumentos}`);
                // Llama al método correspondiente y le pasa los argumentos
                // como un array de strings
                this[metodo](...argumentos);

            } catch (err){
                console.log(err);
            }
        });


        // socket cliente del servidor
        this.socketReq = zmq.socket('req');
        this.socketReq.connect(`tcp://${this.servidorIP}:${puertoReq}`);


        // socket subscriptor
        this.socketSub = zmq.socket('sub');
        this.socketSub.connect(`tcp://${servidorIP}:${puertoSub}`);
        this.socketSub.subscribe('deamon');

        this.socketSub.on('message', (topic, metodo, argumentos) => {
            try{
                metodo = metodo.toString();
                argumentos = argumentos.toString().split(',');

                console.log(`Tarea publicada por el servidor -> metodo: ${metodo}, argumentos: ${argumentos}`);

                // Pasamos la tarea al método correspondiente
                this[metodo](...argumentos);
            } catch (err){
                console.log(err);
            }
        });

    }

    // Promesa que devuelve las respuestas del servidor
    respuestaServidor(){
        return new Promise((resolve) => {
            this.socketReq.on('message', (respuesta) => {
                resolve(respuesta.toString());
            });
        });
    }

    comandoBash(comando){
        return new Promise((resolve,reject) => {
            exec(comando, (err,stdout,stderr) => {
                if (err){
                    reject(err);
                } else{
                    resolve([stdout,stderr]);
                }
            });
        });
    }

    // Método para darme de alta en el servidor
    async darmeDeAlta(miNombre, miIP){

        try{
            console.log("Dandome de alta en el clúster, esperando respuesta...");
            this.registrameEnElCluster(miNombre,miIP);
    
            let respuesta = await this.respuestaServidor();
            console.log(`Respuesta del servidor: ${respuesta}`);
    
            if (respuesta !== 'dentro'){
                this.socketReq.close();
                this.socketServicio.close();
                this.socketSub.close();
                process.exit(1);
            }

        } catch (err){
            console.log(err);
        }
    }

    async dameInfoSistema(){

        try{
            console.log(`Pidiendo información del clúster al servidor`);
            this.infoSistema();
            let respuesta = await this.respuestaServidor();
    
            // Respondemos al cliente con toda la info
            this.socketServicio.send(respuesta);

        } catch(err){
            console.log(err);
        }

    }

    // Configurar el nodo
    async configurameElNodo(subred){
        this.subred = subred;
        console.log(`subred recibida: ${this.subred}`);

        try{
            // Construir la imagen de los contenedores sin red
            console.log("Generando imagen Docker: ubuntu_overlay");
            // let [stdout, stderr] = await this.comandoBash(`sudo docker build -t ubuntu_overlay .`)
            // console.log(stdout);

            

            console.log("Cambiando politica de la cadena de FORWARD a ACCEPT");
            //let [stdout, stderr] = await this.comandoBash(`sudo iptables -P FORWARD ACCEPT`);

            console.log("Comprobando si existe directorio: /run/netns/");
            if (existsSync('/run/netns')){
                console.log("Existe el directorio: /run/netns");
            } else{
                console.log("No existe el directorio: /run/netns");
                //await mkdir('/run/netns/');
            }

            // Aplicar reglas de Source NAT para la subred seleccionada

            // Listar todas las reglas de nat
            let [stdout, stderr] = await this.comandoBash(`sudo iptables -t nat -S`);

            // Separar las reglas por filas y buscar el match
            let match = stdout.split('\n').find(line => line === `-A POSTROUTING -s ${subred} -j MASQUERADE`);
            // Si match es indefinido se pone regla, sino nada
            if (typeof(match) === 'undefined'){
                console.log("Poniendo regla de NAT en iptables");
                //[stdout, stderr] = await this.comandoBash(`sudo iptables -t nat -A POSTROUTING -s ${subred} -j MASQUERADE`)
            }


            // Levantar interfaces
            console.log("Levantando interfaces bridge and VxLAN");
            // let [stdout, stderr] = await this.comandoBash(`sudo ip link add br0 type bridge`);


            console.log("Pidiendo una direccion IP para el bridge al servidor, esperando respuesta...");
            this.dameBridgeIP(this.subred, this.miNombre);

            this.bridgeIP = await this.respuestaServidor();
            console.log(`IP devuelta del servidor: ${this.bridgeIP}`);

            // Poner la IP al bridge
            console.log(`Asignando la IP ${this.bridgeIP} al br0`);
            //let [stdout, stderr] = await this.comandoBash(`sudo ip a add ${this.bridgeIP} dev br0`)

            // Respondemos al cliente que todo bien
            this.socketServicio.send('Nodo configurado, listo para el servicio!!')

        } catch (err) {
            console.log(err);
        }
    }

    // Levantar contenedor cuando el servidor mande la tarea
    async teTocaArremangarteYLevantar(nodo, nombreCont, IP){
        // Comprobamos si me ha tocado a mi
        if (nodo !== this.miNombre){
            console.log(`La tarea no es para mi`);
            return
        }
        
        try{
            // Lanzamos el contenedor sin red
            console.log(`Levantando contenedor "${nombreCont}", sin configuración de red`);
            //let [stdout, stderr] = await this.comandoBash(`sudo docker run -itd --rm --network=none --name=${nombreCont} ubuntu_overlay`);

            // Cazamos el PID del contenedor
            console.log(`Recogemos el PID del contenedor ${nombreCont}`);
            //let [pid, stderr] = await this.comandoBash(`sudo docker inspect --format '{{.State.Pid}}' ${nombreCont}`);

            // Creamos link simbólico del netns del contenedor a /run/netns/
            console.log("Creamos link simbólico del netns del contenedor a /run/netns/");
            //[stdout, stderr] = await this.comandoBash(`sudo ln -s /proc/${pid}/ns/net /run/netns/netns_${nombreCont}`);

            // Creamos interfaces veth
            console.log(`Creando las interfaces VETH y conectando con br0`);
            //[stdout, stderr] = await this.comandoBash(`sudo ip link add eth0 netns netns_${nombreCont} type veth peer name veth_${nombreCont}`);

            // Asignamos direccion IP
            console.log(`Asignando la direccion IP: ${IP}, a la interfaz eth0 del netns_${nombreCont}`);
            //[stdout, stderr] = await this.comandoBash(`sudo ip -n netns_${nombreCont} a add ${IP} dev eth0`);

            // Levantamos las interfaces
            //[stdout, stderr] = await this.comandoBash(`sudo ip -n netns_${nombreCont} link set eth0 up`);
            //[stdout, stderr] = await this.comandoBash(`sudo ip link set veth_${nombreCont} up`);

            // Anclamos la veth del netns del host a br0
            //[stdout, stderr] = await this.comandoBash(`sudo ip link set veth_${nombreCont} master br0`);

            // Reglas de enrutamiento
            //[stdout, stderr] = await this.comandoBash(`sudo ip -n netns_${nombreCont} r add default via ${this.bridgeIP.split('/')[0]}`);

            // Si todo ha ido bien hasta aqui nos guardamos la info del contenedor
            console.log(`Levantamiento finalizado con éxito, guardamos la info del contenedor`);
            this.misContenedores.push(new Contenedor(nombreCont, IP, "pid", `netns_${nombreCont}`, `veth_${nombreCont}`));
            console.log(this.misContenedores);

        } catch(err){
            console.log(err);
        }

    }

    async teTocaTumbarlo(nodo, contIP, nombreCont){
        // Comprobamos si me ha tocado a mi
        if (nodo !== this.miNombre){
            console.log(`La tarea no es para mi`);
            return
        }

        try{
            console.log(`Buscando contenedor ${nombreCont} para tumbarlo`);
            // Buscamos el contenedor en la lista del deamon
            const contenedor = this.misContenedores.find(contenedor => contenedor.nombre === nombreCont);
            console.log(`Contenedor encontrado: ${contenedor}`);
    
    
            console.log(`Deshaciendo el link simbólico del netns y tumbando contenedor`);
            // Eliminamos link simbolico y matamos el contenedor
            //let [stdout, stderr] = await this.comandoBash(`sudo unlink /run/netns/${contenedor.netns}`);
            //let [stdout, stderr] = await this.comandoBash(`sudo docker kill ${contenedor.nombre}`);
    
            console.log(`Contenedor ${contenedor.nombre} tumbado, eliminandolo de la lista de contenedor activos de este nodo`);
            // Hay que sacar ese contenedor de la lista
            this.sacaloDeLaLista(this.misContenedores, contenedor);
            console.log(this.misContenedores);

        } catch(err){
            console.log(err);
        }
    }

    async levantaContenedor(nodo, contenedor){
        try{
            console.log(`Hay que levantar en el nodo: ${nodo}, el contenedor: ${contenedor}`);

            // Pasando la petición al servidor
            this.hayQueLevantarOtro(nodo, contenedor, this.subred);
            let respuesta = await this.respuestaServidor();
            console.log(`Respuesta del servidor: ${respuesta}`);
    
    
            this.socketServicio.send('Petición recibida por el servidor');

        } catch(err){
            console.log(err);
        }
    }

    async eliminaContenedor(nombreCont, IP){

        try{
            // Pasando la petición al servidor
            this.hayQueTumbarContenedor(nombreCont, IP);
            let respuesta = await this.respuestaServidor();
            console.log(`Respuesta del servidor: ${respuesta}`);

            this.socketServicio.send('Petición recibida por el servidor');

        } catch(err){
            console.log(err);
        }
    }

    sacaloDeLaLista(lista, objeto){
        const nombreObjeto = objeto.nombre;
        const indice = lista.map((elem) => elem.nombre).indexOf(nombreObjeto);

        if (indice === -1){
            console.log(`${objeto} no se ha encontrado en ${lista}`);
        } else{
            lista.splice(indice, 1);
        }
    }

    prueba(mensaje){
        console.log(`Estoy en el metodo de prueba del deamon, he recibido: ${mensaje}`);
    }


    // Proxy del servidor

    // En los proxys mandamos como primer elemento del array el método
    // y el resto son los argumentos

    dameBridgeIP(subred,miNombre){
        const metodo = 'dameBridgeIP';
        const argumentos = subred + ',' + miNombre;
        this.socketReq.send([metodo, argumentos]);
    }

    registrameEnElCluster(nombreNodo, nodoIP){
        const metodo = 'registrameEnElCluster';
        const argumentos = nombreNodo + ',' + nodoIP;
        this.socketReq.send([metodo,argumentos]);
    }

    infoSistema(vacio){
        const metodo = 'infoSistema';
        const argumentos = '';
        this.socketReq.send([metodo, argumentos]);
    }

    hayQueLevantarOtro(nodo, nombreCont, subred){
        const metodo = 'hayQueLevantarOtro';
        const argumentos = nodo + ',' + nombreCont + ',' + subred;
        this.socketReq.send([metodo, argumentos]);
    }

    hayQueTumbarContenedor(nombreCont, IP){
        const metodo = 'hayQueTumbarContenedor';
        const argumentos = nombreCont + ',' + IP;
        this.socketReq.send([metodo, argumentos]);
    }
}


const main = () => {
    const miNombre = process.argv[2] || 'Zeus';
    const servidorIP = process.argv[3] || 'localhost';
    const miIP = process.argv[4] || 'localhost';
    const LAN = process.argv[5] || '192.168.1.0/24';
    const puertoServicio = process.argv[6] || 5002;
    const puertoReq = process.argv[7] || 8081;
    const puertoSub = process.argv[8] || 8080;

    const deamon = new Deamon(
                            miNombre,
                            miIP,
                            servidorIP,
                            LAN,
                            puertoServicio,
                            puertoReq,
                            puertoSub);
                        
    
    deamon.darmeDeAlta(deamon.miNombre, deamon.miIP);


    // Para matar el programa
    process.on('SIGINT', () => {
        console.log("Cerrando servicio y matando deamon");
        deamon.socketServicio.close();
        deamon.socketReq.close();
        deamon.socketSub.close();
    });

}

main();