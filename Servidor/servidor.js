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

            this[metodo](argumentos);
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
        this.socketRep.send('ey que pasa');

        console.log(`Publico noticia a la prueba`);
        this.socketPub.send(['deamon','PUBLICANDO NOTICIA DE PRUEBA']);
    }

    soyNodoNuevo(subred,miNombre){
        
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