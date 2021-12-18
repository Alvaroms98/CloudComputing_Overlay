// Controlador de la operación de construcción-destrucción de contenedores
// Gestiona la operación de los deamons del cluster y es el único que puede
// acceder a la base de datos "etcd" para consultar-escribir-eliminar claves

const zmq = require('zeromq');

class Nodo{
    constructor(nombre,subred){
        this.nombre = nombre;
        this.subred = subred;

        [this.dir, this.masc] = this.subred.split('/');
        
    }
}


class Servidor{
    constructor(puertoRep, puertoPub){
        this.puertoRep = puertoRep;
        this.puertoPub = puertoPub;

        this.infoNodos = [];

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

    prueba(mensaje){
        console.log(`Petición del cliente: ${mensaje}`);
        
        // Esperando dos segundo para responder
        setTimeout(() => {
            this.socketRep.send('ey que pasa');
            console.log(`Publico noticia a la prueba`);
            this.socketPub.send(['deamon','PUBLICANDO NOTICIA DE PRUEBA']);
        },2000);
        
    }

    soyNodoNuevo(subred,nombreNodo){
        console.log(`Añadiendo al nuevo nodo: ${nombreNodo}`);
        this.infoNodos.push(new Nodo(nombreNodo, subred));
        console.log(this.infoNodos);

        const IP = this.eligeIP(subred,nombreNodo,'bridge');
        
        this.setBridgeIP(IP);
    }

    eligeIP(subred, nodo, objeto){
        console.log(`Eligiendo IP para nodo: ${nodo}`);

        var [IP,masc] = subred.split('/');
        var [byte1,byte2,byte3,byte4] = IP.split('.');

        switch (masc){
            case '24':

                for (const i of Array(253).keys()){
                    console.log(`Probando IP: ${byte1}.${byte2}.${byte3}.${i+1}`);
                    let pruebaIP = `${byte1}.${byte2}.${byte3}.${i+1}`;
                    // Hacer una prueba de disponibilidad
                    if (pruebaIP === '192.168.111.10'){
                        IP = pruebaIP + '/' + masc;
                        break;
                    }
                }
                break;

            case '16':

                for (const i of Array(253).keys()){
                    for (const j of Array(253).keys()){
                        console.log(`Probando IP: ${byte1}.${byte2}.${i+1}.${j+1}`);
                        let pruebaIP = `${byte1}.${byte2}.${i+1}.${j+1}`;
                    }
                }
                break;

            case '8':

                for (const i of Array(253).keys()){
                    for (const j of Array(253).keys()){
                        for (const k of Array(253).keys()){
                            console.log(`Probando IP: ${byte1}.${i+1}.${j+1}.${k+1}`);
                            let pruebaIP = `${byte1}.${i+1}.${j+1}.${k+1}`;
                        }
                    }
                }
                break;
            default:
                console.log(`La máscara del segmento de red es erróneo`);
                break;
        }

        console.log(`IP seleccionada: ${IP}`);
        return IP
    }

    // Proxy de los deamons

    setBridgeIP(bridgeIP){
        const metodo = 'setBridgeIP';
        const argumentos = bridgeIP;
        this.socketRep.send([metodo,argumentos]);
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