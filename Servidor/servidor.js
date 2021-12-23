// Controlador de la operación de construcción-destrucción de contenedores
// Gestiona la operación de los deamons del cluster y es el único que puede
// acceder a la base de datos "etcd" para consultar-escribir-eliminar claves

const zmq = require('zeromq');
const { Etcd3 } = require('etcd3');

// Clase para que el servidor lleve un registro de los nodos del clúster
class Nodo{
    constructor(nombre,IP){
        this.nombre = nombre;
        this.IP = IP;        
    }
}

// Clase para almacenar información de contenedores o bridges en etcd
class Valor{
    constructor(nombre, IP, nodo){
        this.nombre = nombre;
        this.IP = IP;
        this.nodo = nodo;
    }
}


class Servidor{
    constructor(puertoRep, puertoPub){
        this.puertoRep = puertoRep;
        this.puertoPub = puertoPub;

        this.infoNodos = [];

        // Cliente etcd
        this.etcd = new Etcd3({hosts:'localhost:2379'});

        // socket servidor (reply)
        this.socketRep = zmq.socket('rep');
        this.socketRep.bind(`tcp://*:${puertoRep}`, (err) => {
            if (err){
                console.log(err);
            } else{
                console.log(`Recibiendo peticiones en el puerto ${puertoRep}`);
            }
        });

        this.socketRep.on('message', (metodo,argumentos) => {
            metodo = metodo.toString();
            argumentos = argumentos.toString().split(',');

            console.log(`Peticion de un deamon -> metodo: ${metodo}, argumentos: ${argumentos}`);

            this[metodo](...argumentos);
        });


        // socket publicador
        this.socketPub = zmq.socket('pub');
        this.socketPub.bind(`tcp://*:${puertoPub}`, (err) => {
            if (err){
                console.log(err);
            } else{
                console.log(`Publicando tareas en el puerto ${puertoPub}`);
            }
        });
    }

    registrameEnElCluster(nombreNodo, nodoIP){
        const match = this.infoNodos.find(nodo => nodo.nombre === nombreNodo);
        if (match){
            // Responder al deamon
            this.socketRep.send('Ya existe un nodo con ese nombre');
        } else{
            console.log(`Añadiendo al nuevo nodo: ${nombreNodo}`);
            this.infoNodos.push(new Nodo(nombreNodo, nodoIP));
            console.log(this.infoNodos);

            // Responder al deamon
            this.socketRep.send('dentro');
        }
    }

    async infoSistema(vacio){
        // Consultar la base de datos
        const todo = await this.etcd.getAll().all();
        const todoObjetos = Object.values(todo);

        // ver los nodos dados de alta
        const nodosActivos = [];
        for (const nodoActivo of this.infoNodos){
            nodosActivos.push(nodoActivo.nombre);
        }

        // Responder al deamon con la información
        this.socketRep.send(`${todoObjetos}\t${nodosActivos}`);
    }

    async hayQueLevantarOtro(nodo, nombreCont, subred){
        const IP = await this.eligeIP(subred, nodo, nombreCont);

        // una vez elegida la IP, publicamos la tarea
        this.teTocaArremangarteYLevantar(nodo, nombreCont, IP);

        // Respondemos al deamon que ha notificado de la tarea que todo ok
        this.socketRep.send('La tarea ya está enviada al clúster');
    }

    async hayQueTumbarContenedor(nombreCont, IP){
        // Hay que buscar la IP en etcd y si hay match enviar la tarea

        // Nos quedamos con la IP sin la máscara
        IP = IP.split('/')[0];

        // Buscamos la IP en la base de datos
        let match = await this.etcd.get(IP);
        
        // Si no hay match respondemos al deamon que no existe
        if (!match){
            console.log(`No se ha encontrado la IP: ${IP} en la base de datos`);
            console.log(`No se puede eliminar el objeto "${nombreCont}"`);
            this.socketRep.send(`No se ha encontrado la IP -> ${IP} en la base de datos, no se puede llevar a cabo la eliminación del objeto`);
        }

        // Si se encuentra la key hay que eliminarlo de la base de datos
        await this.etcd.delete().key(IP);

        // Lo pasamos a un objeto de JS
        match = JSON.parse(match);

        console.log(`Se ha eliminado de la base de datos -> ${IP}:{nombre = ${match.nombre}, IP = ${match.IP}, nodo = ${match.nodo}}`);

        // Publicamos la tarea
        this.teTocaTumbarlo(match.nodo, match.IP, match.nombre);

        // Responder al deamon que ha notificado la tarea que todo ok
        this.socketRep.send('La tarea ya está enviada al clúster');
    }



    async dameBridgeIP(subred,nombreNodo){
        const IP = await this.eligeIP(subred,nombreNodo,'br0');
        
        // Responder al deamon
        this.socketRep.send(IP);
    }

    async eligeIP(subred, nodo, objeto){
        console.log(`Eligiendo IP para nodo: ${nodo}`);

        var [IP,masc] = subred.split('/');
        var [byte1,byte2,byte3,byte4] = IP.split('.');

        var match;
        var valor;
        switch (masc){
            case '24':

                for (const i of Array(253).keys()){
                    console.log(`Probando IP: ${byte1}.${byte2}.${byte3}.${i+1}`);
                    let pruebaIP = `${byte1}.${byte2}.${byte3}.${i+1}`;

                    // Preguntarmos a etcd si está registrada esa IP
                    match = await this.etcd.get(pruebaIP);
                    if (!match){
                        IP = pruebaIP + '/' + masc;
                        valor = new Valor(objeto, IP, nodo);
                        // Registrar IP y objeto en la base de datos
                        await this.etcd.put(pruebaIP).value(JSON.stringify(valor));
                        break;
                    }
                }
                if (match){
                    // Aqui hay que hacer algo más para no devolver ninguna IP
                    console.log(`No hay IPs disponibles`);
                }
                
                break;

            case '16':
                loop1:
                for (const i of Array(253).keys()){
                    for (const j of Array(253).keys()){
                        console.log(`Probando IP: ${byte1}.${byte2}.${i+1}.${j+1}`);
                        let pruebaIP = `${byte1}.${byte2}.${i+1}.${j+1}`;

                        // Preguntarmos a etcd si está registrada esa IP
                        match = await this.etcd.get(pruebaIP);
                        if (!match){
                            IP = pruebaIP + '/' + masc;
                            valor = new Valor(objeto, IP, nodo);
                            // Registrar IP y objeto en la base de datos
                            await this.etcd.put(pruebaIP).value(JSON.stringify(valor));
                            break loop1;
                        }
                    }
                }
                if (match){
                    console.log(`No hay IPs disponibles`);
                }
                break;

            case '8':
                loop1:
                for (const i of Array(253).keys()){
                    for (const j of Array(253).keys()){
                        for (const k of Array(253).keys()){
                            console.log(`Probando IP: ${byte1}.${i+1}.${j+1}.${k+1}`);
                            let pruebaIP = `${byte1}.${i+1}.${j+1}.${k+1}`;
                             // Preguntarmos a etcd si está registrada esa IP
                            match = await this.etcd.get(pruebaIP);
                            if (!match){
                                IP = pruebaIP + '/' + masc;
                                valor = new Valor(objeto, IP, nodo);
                                // Registrar IP y objeto en la base de datos
                                await this.etcd.put(pruebaIP).value(JSON.stringify(valor));
                                break loop1;
                            }
                        }
                    }
                }
                if (match){
                    console.log(`No hay IPs disponibles`);
                }
                break;
                
            default:
                console.log(`La máscara del segmento de red es erróneo`);
                break;
        }

        console.log(`IP seleccionada: ${IP}`);
        return IP
    }

    prueba(mensaje){
        console.log(`Petición del cliente: ${mensaje}`);
        
        // Esperando dos segundo para responder
        setTimeout(() => {
            this.socketRep.send('ey que pasa');
            console.log(`Publico noticia a la prueba`);
            this.socketPub.send(['deamon','PUBLICANDO NOTICIA DE PRUEBA']);
        },2000);
        
    }

    // Proxy Deamon, para publicaciones
    teTocaArremangarteYLevantar(nodo, nombreCont, IP){
        const metodo = 'teTocaArremangarteYLevantar';
        const argumentos = nodo + ',' + nombreCont + ',' + IP;
        this.socketPub.send(['deamon', metodo, argumentos]);
    }

    teTocaTumbarlo(nodo, contIP, nombreCont){
        const metodo = 'teTocaTumbarlo';
        const argumentos = nodo + ',' + contIP + ',' + nombreCont;
        this.socketPub.send(['deamon', metodo, argumentos]);
    }

}


const main = () => {
    const puertoRep = process.argv[2] || 8081;
    const puertoPub = process.argv[3] || 8080;

    // Encendemos servidor y nos quedamos a la espera de peticiones
    const servidor = new Servidor(puertoRep,puertoPub);

    process.on('SIGINT', () => {
        console.log("Apagando servidor...");
        servidor.socketPub.close();
        servidor.socketRep.close();
    });
}

main();