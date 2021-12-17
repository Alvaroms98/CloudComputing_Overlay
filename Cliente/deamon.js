// Deamon que es atacado por el cliente para recibir las peticiones de
// creación-destrucción de contenedores, y que se coordina con el resto de
// nodos del cluster por medio del servidor, que gestiona la base de datos "etcd"

const zmq = require('zeromq');
const { exec, spawn } = require('child_process');
const { existsSync } = require('fs');
const { mkdir } = require('fs/promises');


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

        this.socketServicio.on('message', (metodo,argumentos) => {
            // Este truco con 0MQ ya permite tener un proxy universal
            metodo = metodo.toString();
            argumentos = argumentos.toString().split(',');

            // Llama al método correspondiente y le pasa los argumentos
            // como un array de strings
            this[metodo](argumentos);
        });

    }



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
            let [stdout, stderr] = await this.comandoBash(`sudo iptables -t nat -S | grep ${subred}`);
            if (stdout !== `-A POSTROUTING -s ${subred} -j MASQUERADE`){
                console.log(`Poniendo regla de NAT en iptables: -A POSTROUTING -s ${subred} -j MASQUERADE`);
            } else{
                console.log("Reglas de iptables ya están puestas");
            }


            // Levantar interfaces
            console.log("Levantando interfaces bridge and VxLAN");
            // let [stdout, stderr] = await this.comandoBash(`sudo ip link add br0 type bridge`);
            // let [stdout, stderr] = await this.comandoBash(`sudo ip link add br0 type bridge`);


            console.log("Pidiendo una direccion IP para el bridge al servidor, esperando respuesta...");



        } catch (err) {
            console.log(err);
        }
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
        })
    }
}


const main = () => {
    const miNombre = process.argv[2];
    const miIP = process.argv[3];
    const servidorIP = process.argv[4];
    const LAN = process.argv[5];
    const puertoServicio = process.argv[6] || 5002;
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
                        

    // Para matar el programa
    process.on('SIGINT', () => {
        console.log("Cerrando servicio y matando deamon");
        deamon.socketServicio.close();
    })

}

main();