// Controlador de la operación de construcción-destrucción de contenedores
// Gestiona la operación de los deamons del cluster y es el único que puede
// acceder a la base de datos "etcd" para consultar-escribir-eliminar claves

const zmq = require('zeromq');
const { Etcd3 } = require('etcd3');

// Clase para que el servidor lleve un registro de los nodos del clúster
class Nodo{
    constructor(nombre,IP, cpu, RAM){
        this.nombre = nombre;
        this.IP = IP;
        this.CPU = cpu;
        this.freeRAM = RAM;        
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
    constructor(puertoRep, puertoPub, puertoPull){
        this.puertoRep = puertoRep;
        this.puertoPub = puertoPub;
        this.puertoPull = puertoPull;

        this.infoNodos = [];

        // Cliente etcd
        this.etcd = new Etcd3({hosts:'localhost:2379'});

        // Timer para pedir métricas
        this.timerMetricas = setInterval(() => {
            // Solo publicamos la tarea de pedir métricas si hay nodos activos
            if (this.infoNodos.length > 0){
                this.pedirMetricas();
            }
        }, 10000); // Cada diez segundos

        // socket servidor (reply)
        this.socketRep = zmq.socket('rep');
        this.socketRep.bind(`tcp://*:${this.puertoRep}`, (err) => {
            if (err){
                console.log(err);
            } else{
                console.log(`Recibiendo peticiones en el puerto ${this.puertoRep}`);
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
        this.socketPub.bind(`tcp://*:${this.puertoPub}`, (err) => {
            if (err){
                console.log(err);
            } else{
                console.log(`Publicando tareas en el puerto ${this.puertoPub}`);
            }
        });


        // socket pull para las métricas
        this.socketPull = zmq.socket('pull');
        this.socketPull.bind(`tcp://*:${this.puertoPull}`, (err) => {
            if (err){
                console.log(err);
            } else{
                console.log(`Recogiendo métricas en el puerto ${this.puertoPull}`);
            }
        });

        this.socketPull.on('message', (metodo, argumentos) => {
            metodo = metodo.toString();
            argumentos = argumentos.toString().split(',');

            console.log(`Métricas de un deamon -> metodo: ${metodo}, argumentos: ${argumentos}`);

            this[metodo](...argumentos);
        });
    }

    pedirMetricas(){
        // Publicar tarea para que los deamons me den las métricas
        this.dameMetricas();
    }

    tomaMetricas(nodo, cpu, RAM){
        // Buscar el nodo en la lista y actualizar sus métricas
        const indice = this.infoNodos.findIndex(elem => elem.nombre === nodo);

        // Cambiar métricas
        this.infoNodos[indice].CPU = cpu;
        this.infoNodos[indice].freeRAM = RAM;

        // Cambiamos patrón de comunicación a tipo push-pull, no hay que responder
        //Responder al deamon
        //this.socketRep.send('Tus métricas están actualizadas en el servidor');
    }

    registrameEnElCluster(nombreNodo, nodoIP){
        const match = this.infoNodos.find(nodo => nodo.IP === nodoIP);
        if (match){
            // Responder al deamon
            this.socketRep.send('Ya existe un nodo con esa dirección IP en el clúster');
        } else{
            console.log(`Añadiendo al nuevo nodo: ${nombreNodo}`);
            this.infoNodos.push(new Nodo(nombreNodo, nodoIP, '0%', '0 Mb'));
            console.log(this.infoNodos);

            // Responder al deamon
            this.socketRep.send('dentro');
        }
    }

    async infoSistema(){
        try{
            // Consultar la base de datos
            const todo = await this.etcd.getAll().all();
            const todoObjetos = Object.values(todo);

            // ver los nodos dados de alta
            const listaNodos = JSON.stringify(this.infoNodos);

            // const nodosActivos = [];
            // for (const nodoActivo of this.infoNodos){
            //     nodosActivos.push(nodoActivo.nombre);
            // }

            // Responder al deamon con la información
            this.socketRep.send(`${todoObjetos}\t${listaNodos}`);

        } catch(err){
            console.log(err);
            this.socketRep.send(err);
        }

    }

    async hayQueLevantarOtro(nodo, nombreCont, subred){
        try{
            const IP = await this.eligeIP(subred, nodo, nombreCont);

            // una vez elegida la IP, publicamos la tarea
            this.teTocaArremangarteYLevantar(nodo, nombreCont, IP);

            // Respondemos al deamon que ha notificado de la tarea que todo ok
            this.socketRep.send('La tarea ya está enviada al clúster');

        } catch(err){
            console.log(err);
            this.socketRep.send(err);
        }
    }

    async hayQueTumbarContenedor(nombreCont, IP){
        try{
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

        } catch(err){
            console.log(err);
            this.socketRep.send(err);
        }

    }

    async abandonoElCluster(nodo, ...IPs){
        // Iterar sobre cada una de las IPs que se pasan en los argumentos para eliminar
        // de la base de datos etcd
        try{
            console.log(`El nodo: ${nodo} está abandonando el clúster...`);
            for (let IP of IPs){
                IP = IP.split('/')[0];
    
                // Buscamos la IP en la base de datos
                let match = await this.etcd.get(IP);
                
                // Si no hay match respondemos al deamon que no existe
                if (!match){
                    console.log(`No se ha encontrado la IP: ${IP} en la base de datos`);
                    console.log(`No se puede eliminar el objeto "${nombreCont}"`);
                    this.socketRep.send(`No se ha encontrado la IP -> ${IP} en la base de datos, no se puede llevar a cabo la eliminación del objeto`);
                    return
                }
    
                // Si se encuentra la key hay que eliminarlo de la base de datos
                await this.etcd.delete().key(IP);

                // Lo pasamos a un objeto de JS
                match = JSON.parse(match);

                console.log(`Se ha eliminado de la base de datos -> ${IP}:{nombre = ${match.nombre}, IP = ${match.IP}, nodo = ${match.nodo}}`);
            }

            // Borrar de la lista el nodo que se da de baja
            const nodoObjeto = this.infoNodos.find(elem => elem.nombre === nodo);
            this.sacaloDeLaLista(this.infoNodos, nodoObjeto);
            console.log(`El nodo: ${nodo} se ha eliminado de la lista de nodos activos`);
            console.log(this.infoNodos);

            // Responder al deamon que se ha dado de baja con éxito
            this.socketRep.send(`Te has dado de baja con éxito, se han liberado todas las IPs que tenías registradas`);

        } catch(err){
            console.log(err);
            this.socketRep.send(err);
        }

    }



    async dameBridgeIP(subred,nombreNodo){
        try{
            const IP = await this.eligeIP(subred,nombreNodo,'br0');
        
            // Responder al deamon
            this.socketRep.send(IP);

        } catch(err){
            console.log(err);
            this.socketRep.send(err);
        }
    }

    async eligeIP(subred, nodo, objeto){
        try{
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
            return IP;
            
        } catch(err){
            console.log(err);
            return err;
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

    dameMetricas(){
        const metodo = 'dameMetricas';
        const argumentos = '';
        this.socketPub.send(['deamon', metodo, argumentos]);
    }

}


const main = () => {
    const puertoRep = process.argv[2] || 8081;
    const puertoPub = process.argv[3] || 8080;
    const puertoPull = process.argv[4] || 8082

    // Encendemos servidor y nos quedamos a la espera de peticiones
    const servidor = new Servidor(puertoRep,puertoPub,puertoPull);

    process.on('SIGINT', () => {
        console.log("Apagando servidor...");
        clearInterval(servidor.timerMetricas);
        servidor.socketPub.close();
        servidor.socketRep.close();
        servidor.socketPull.close();
    });
}

main();