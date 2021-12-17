// Deamon que es atacado por el cliente para recibir las peticiones de
// creación-destrucción de contenedores, y que se coordina con el resto de
// nodos del cluster por medio del servidor, que gestiona la base de datos "etcd"

const zmq = require('zeromq');


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

        //sockets para servir al cliente y para conectarse al servidor

        //socket servicio
        this.socketServicio = zmq.socket('rep');
        this.socketServicio.bind(`tcp://*:${puertoServicio}`, (err) => {
            if (err){
                console.log(err);
            } else{
                console.log(`Sirviendo al cliente en el puerto ${puertoServicio}`);
            }
        });
        this.socketServicio.on('message', (mensaje) => {
            console.log(mensaje.toString());
        });
        this.socketServicio.on('connection', (socket) => {
            console.log("Alguien conectado");
        });

    }
}


const main = () => {
    const miNombre = process.argv[2];
    const miIP = process.argv[3];
    const servidorIP = process.argv[4];
    const LAN = process.argv[5];
    const puertoServicio = process.argv[6] || 5000;
    const puertoReq = process.argv[7] || 7000;
    const puertoSub = process.argv[8] || 7001;

    const deamon = new Deamon(
                            miNombre,
                            miIP,
                            servidorIP,
                            LAN,
                            puertoServicio,
                            puertoReq,
                            puertoSub);
                        
    

}

main();