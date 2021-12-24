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

        this.nodoConfigurado = false;

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
            if(miIP === 'localhost'){
                let stderr;
                // cazar la IP del host
                [this.miIP, stderr] = await this.comandoBash(`sudo ip a | grep -m 1 -A 6 'state UP' | grep -Eo '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}'`);
                this.miIP = this.miIP.slice(0,-1);
            }

            console.log("Dandome de alta en el clúster, esperando respuesta...");
            this.registrameEnElCluster(miNombre,this.miIP);
    
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

    // Método para darme de baja del servidor, eliminar contenedores y limpiar todo

    async darmeDeBaja(){
        try{
            // Guardamos todas la IPs utilizadas en este nodo (contenedores y bridge)
            // en una variable, para enviarsela al servidor
            const contIPs = this.misContenedores.map((cont) => cont.IP);
            let allIPs = this.bridgeIP;
            for (const contIP of contIPs){
                allIPs += ',' + contIP;
            }

            // Enviarle al servidor todas las IPs para que las libere y me de de baja
            this.abandonoElCluster(this.miNombre, allIPs);
            const respuesta = await this.respuestaServidor();
            console.log(`Respuesta del servidor: ${respuesta}`);

            // for loop para eliminar todos los contenedores
            for (const contenedor of this.misContenedores){
                await this.teTocaTumbarlo(this.miNombre, contenedor.IP, contenedor.nombre);
            }

            // Eliminar las interfaces bridge y vxlan
            let [stdout, stderr] = await this.comandoBash(`sudo ip link del br0`);
            [stdout, stderr] = await this.comandoBash(`sudo ip link del vxlan1`);

            // Podriamos limpiar Iptables... pero aún no se como hacerlo

            // Cuando todo esté limpio, respondemos al cliente y cerramos
            this.socketServicio.send(`Todo tumbado y todo limpio, hasta luego!`);

            this.matarDeamon();
        } catch(err){
            console.log(err);
        }
    }

    // Comprobar si se ha configurado ya cuando la consola ataque al deamon
    estasConfigurado(){
        // El protocolo de respuesta es: si o no

        if (this.nodoConfigurado){
            const respuesta = 'si';
            const info = `Este nodo (alias: ${this.miNombre}) está configurado con subred: ${this.subred}`;
            this.socketServicio.send(respuesta + ',' + info);
        } else{
            const respuesta = 'no';
            const info = `Este nodo (alias: ${this.miNombre}) no está configurado todavía`;
            this.socketServicio.send(respuesta + ',' + info);
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
            let [stdout, stderr] = await this.comandoBash(`sudo docker build -t ubuntu_overlay .`);
            console.log(stdout);

            

            console.log("Cambiando politica de la cadena de FORWARD a ACCEPT");
            [stdout, stderr] = await this.comandoBash(`sudo iptables -P FORWARD ACCEPT`);

            console.log("Comprobando si existe directorio: /run/netns/");
            if (existsSync('/run/netns')){
                console.log("Existe el directorio: /run/netns");
            } else{
                console.log("No existe el directorio: /run/netns");
                [stdout, stderr] = await this.comandoBash(`sudo mkdir /run/netns`);
            }

            // Aplicar reglas de Source NAT para la subred seleccionada

            // Listar todas las reglas de nat
            [stdout, stderr] = await this.comandoBash(`sudo iptables -t nat -S`);

            // Separar las reglas por filas y buscar el match
            let match = stdout.split('\n').find(line => line === `-A POSTROUTING -s ${subred} -j MASQUERADE`);
            // Si match es indefinido se pone regla, sino nada
            if (typeof(match) === 'undefined'){
                console.log("Poniendo regla de NAT en iptables");
                [stdout, stderr] = await this.comandoBash(`sudo iptables -t nat -A POSTROUTING -s ${subred} -j MASQUERADE`);
            }


            // Crear y levantar interfaces bridge=br0 y Vxlan=vxlan1
            console.log("Levantando interfaces bridge y VxLAN");
            [stdout, stderr] = await this.comandoBash(`sudo ip link add br0 type bridge`);
            

            let hostIF;
            [hostIF, stderr] = await this.comandoBash(`sudo ip a | grep -m 1 'state UP' | awk '{print $2}'`);
            hostIF = hostIF.slice(0,-2);
            [stdout, stderr] = await this.comandoBash(`sudo ip link add vxlan1 type vxlan id 42 dstport 4789 group 239.1.1.1 local ${this.miIP.split('/')[0]} dev ${hostIF} ttl 20`);
            [stdout, stderr] = await this.comandoBash(`sudo ip link set vxlan1 master br0`);
            [stdout, stderr] = await this.comandoBash(`sudo ip link set vxlan1 up`);
            [stdout, stderr] = await this.comandoBash(`sudo ip link set br0 up`);


            console.log("Pidiendo una direccion IP para el bridge al servidor, esperando respuesta...");
            this.dameBridgeIP(this.subred, this.miNombre);

            this.bridgeIP = await this.respuestaServidor();
            console.log(`IP devuelta del servidor: ${this.bridgeIP}`);

            // Poner la IP al bridge
            console.log(`Asignando la IP ${this.bridgeIP} al br0`);
            [stdout, stderr] = await this.comandoBash(`sudo ip a add ${this.bridgeIP} dev br0`);


            // Ponemos el flag de configuración en True
            this.nodoConfigurado = true;


            // Respondemos al cliente que todo bien
            this.socketServicio.send('Nodo configurado, listo para el servicio!!');

        } catch (err) {
            console.log(err);
            this.socketServicio.send(err);
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
            let [stdout, stderr] = await this.comandoBash(`sudo docker run -itd --rm --network=none --name=${nombreCont} ubuntu_overlay`);

            // Cazamos el PID del contenedor
            console.log(`Recogemos el PID del contenedor ${nombreCont}`);
            let pid;
            [pid, stderr] = await this.comandoBash(`sudo docker inspect --format '{{.State.Pid}}' ${nombreCont}`);
            pid = pid.slice(0,-1);

            // Creamos link simbólico del netns del contenedor a /run/netns/
            console.log("Creamos link simbólico del netns del contenedor a /run/netns/");
            [stdout, stderr] = await this.comandoBash(`sudo ln -s /proc/${pid}/ns/net /run/netns/netns_${nombreCont}`);

            // Creamos interfaces veth
            console.log(`Creando las interfaces VETH y conectando con br0`);
            [stdout, stderr] = await this.comandoBash(`sudo ip link add eth0 netns netns_${nombreCont} type veth peer name veth_${nombreCont}`);

            // Asignamos direccion IP
            console.log(`Asignando la direccion IP: ${IP}, a la interfaz eth0 del netns_${nombreCont}`);
            [stdout, stderr] = await this.comandoBash(`sudo ip -n netns_${nombreCont} a add ${IP} dev eth0`);

            // Levantamos las interfaces
            [stdout, stderr] = await this.comandoBash(`sudo ip -n netns_${nombreCont} link set eth0 up`);
            [stdout, stderr] = await this.comandoBash(`sudo ip link set veth_${nombreCont} up`);

            // Anclamos la veth del netns del host a br0
            [stdout, stderr] = await this.comandoBash(`sudo ip link set veth_${nombreCont} master br0`);

            // Reglas de enrutamiento
            [stdout, stderr] = await this.comandoBash(`sudo ip -n netns_${nombreCont} r add default via ${this.bridgeIP.split('/')[0]}`);

            // Para que el proxy arp de la interfaz vxlan pueda actuar en nombre de este nuevo contenedor
            // este contenedor ha de exponerse al menos 1 vez antes de ser localizado por el resto
            // esto se puede hacer haciendo ping al bridge local para que vxlan1 se guarde la dirección MAC de el veth que hay en
            // el contenedor

            [stdout, stderr] = await this.comandoBash(`sudo docker exec ${nombreCont} ping -c 1 ${this.bridgeIP.split('/')[0]}`);

            // Si todo ha ido bien hasta aqui nos guardamos la info del contenedor
            console.log(`Levantamiento finalizado con éxito, guardamos la info del contenedor`);
            this.misContenedores.push(new Contenedor(nombreCont, IP, pid, `netns_${nombreCont}`, `veth_${nombreCont}`));
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
            console.log(`Contenedor encontrado: `, contenedor);
    
    
            console.log(`Deshaciendo el link simbólico del netns y tumbando contenedor`);
            // Eliminamos link simbolico y matamos el contenedor
            let [stdout, stderr] = await this.comandoBash(`sudo unlink /run/netns/${contenedor.netns}`);
            [stdout, stderr] = await this.comandoBash(`sudo docker kill ${contenedor.nombre}`);
    
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
            this.socketServicio.send(err);
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
            this.socketServicio.send(err);
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

    matarDeamon(){
        console.log("Cerrando servicio y matando deamon");
        this.socketServicio.close();
        this.socketReq.close();
        this.socketSub.close();
        process.exit(0);
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

    abandonoElCluster(nodo, IPs){
        const metodo = 'abandonoElCluster';
        const argumentos = nodo + ',' + IPs;
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
        process.exit(1);
    });

}

main();