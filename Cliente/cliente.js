// Interfaz de usuario (UI) para comunicarse con el deamon que le gestiona las tareas
// de creación y destrucción de contenedores en el cluster de la LAN

// Dependencias
const { memoryUsage } = require('process');
const { stringify } = require('querystring');
const readline = require('readline');
const zmq = require('zeromq');

class Menu{
    constructor(puertoDeamon){
        this.puertoDeamon = puertoDeamon;

        // interfaz para escribir por consola
        this.teclado = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        // socket zmq Req para hacer peticiones al deamon
        this.socketReq = zmq.socket('req');
        this.socketReq.connect(`tcp://localhost:${puertoDeamon}`);

    }

    // Promesa que devuelve las respuestas del deamon
    respuestaDeamon(){
        return new Promise((resolve) => {
            this.socketReq.on('message', (respuesta) => {
                resolve(respuesta.toString());
            });
        })
    }

    // Devuelve una promesa que se cumple cuando el usuario pone una opción
    preguntaAlUsuario(pregunta){
        return new Promise((resolve,reject) => {
            try{
                this.teclado.resume();
                this.teclado.question(pregunta, (respuesta) => {
                    this.teclado.pause();
                    resolve(respuesta)
                });
            } catch(err){
                console.log(err);
                reject(err);
            }
        });
    }

    async acciones(){
        try{
            // Imprimimos el menú de acciones
            this.imprimirMenu();

            // preguntamos al usuario que quiere hacer
            const opcion = await this.preguntaAlUsuario('Elige una opción: ');

            switch (opcion){
                case "1":
                    await this.quieroContenedor();
                    break;
                case "2":
                    await this.quieroEliminarContenedor();
                    break;
                case "3":
                    await this.mostrarInfoSistema();
                    break;
                case "4":
                    await this.suspenderNodo();
                    break;
                case "5":
                    this.cerrarConsola();
                    break;
                default:
                    console.log("La opción no corresponde con ninguna disponible");
                    break;
            }

        } catch(err){
            console.log(err);
        }
    }
    
    async configurarNodo(){
        try{
            let flag = false;
            let subred;
            while(!flag){
                subred = await this.preguntaAlUsuario('¿Segmento de red donde poner los contenedores?: (p.e. 192.168.111.0/24) ');
                if (subred.split('.').length === 4 && subred.split('/').length === 2){
                    flag = true;
                } else{
                    console.log('Segmento de red erróneo, pruebe de nuevo...\n');
                }
            }

            this.configurameElNodo(subred)
            console.log(`Esperando a que el deamon configure el nodo`);
            let respuesta = await this.respuestaDeamon();
            console.log(`Respuesta del deamon: ${respuesta}`);

        } catch(err){
            console.log(err);
        }
    }




    imprimirMenu(){
        const item1 = '1. Levantar Contenedor';
        const item2 = '2. Destruir Contenedor';
        const item3 = '3. Información del sistema';
        const item4 = '4. Dar de baja nodo y cerrar';
        const item5 = '5. Cerrar consola';
        console.log(`\n\n\tMENU\n${item1}\n${item2}\n${item3}\n${item4}\n${item5}`);
    }

    async pedirInformacionSistema(){
        try{
            console.log("Pidiendo información del clúster al deamon");
            this.dameInfoSistema();

            console.log("Esperando respuesta...");

            let respuesta = await this.respuestaDeamon();
            let [objetos, nodosActivos] = respuesta.split('\t');

            // Truquito para el string de jsons en objetos
            objetos = objetos.replaceAll('},{','}|{').split('|');
            objetos.forEach((objeto,index,array) => {
                array[index] = JSON.parse(objeto);
            });

            // Los nodos activos aparte, pues puede que no tengan contenedores
            nodosActivos = nodosActivos.split(',');
            
            return [objetos, nodosActivos];

        } catch(err){
            console.log(err);
            return err;
        }
    }

    async mostrarInfoSistema(){
        try{
            let [objetos, nodosActivos] = await this.pedirInformacionSistema();

            // Sacar información en forma de tabla
            console.log("\nINFORMACION DEL SISTEMA\n");
            console.table(objetos);

            console.log("\nNODOS ACTIVOS\n");
            console.table(nodosActivos);

        } catch(err){
            console.log(err);
        }
    }

    async quieroEliminarContenedor(){
        try{
            // Pedir información del sistema para mostrar los contenedores
            let [objetos, _] = await this.pedirInformacionSistema();

            // Filtrar de los objetos solo los contenedores
            let contenedores = objetos.filter(contenedor => contenedor.nombre !== 'br0');

            // Mostrar contenedores activos
            console.log("\nCONTENEDORES ACTIVOS\n");
            console.table(contenedores);

            // Pedir nombre del contenedor que quiere eliminar
            let nombreCont = await this.preguntaAlUsuario('¿Qué contenedor quiere tumbar? ');

            // Verificación de que existe
            let match = contenedores.find(contenedor => contenedor.nombre === nombreCont);
            if (typeof(match) === 'undefined'){
                console.log('Ese contenedor no existe');
                return;
            }

            console.log(`Enviando petición de tumbar el contenedor ${match.nombre} al deamon`);
            this.eliminaContenedor(match.nombre, match.IP);
            console.log(`Esperando respuesta del deamon...`);
            let respuesta = await this.respuestaDeamon();
            console.log(`Respuesta del deamon: ${respuesta}`);
        
        } catch(err){
            console.log(err);
        }

    }

    async quieroContenedor(){
        try{
            // Pedir información de los nodos disponibles
            let [objetos, nodosActivos] = await this.pedirInformacionSistema();

            // Sacar información en forma de tabla
            console.log("\nINFORMACION DEL SISTEMA\n");
            console.table(objetos);

            console.log("\nNODOS ACTIVOS\n");
            console.table(nodosActivos);

            // Pedir nodo donde ponerlo
            let nodo = await this.preguntaAlUsuario('¿En que Nodo? ');
            
            // Comprobar que es correcto
            let verificar = nodosActivos.find(Activo => Activo === nodo);
            if (typeof(verificar) === 'undefined'){
                console.log(`Ese nodo no existe`);
                return;
            }


            // Pedir nombre del contenedor
            let contenedor = await this.preguntaAlUsuario('¿Nombre del contenedor? ');

            // Comprobar que es correcto
            verificar = objetos.find(objeto => objeto.nombre === contenedor);

            if (typeof(verificar) !== 'undefined'){
                console.log(`El nombre de ese contenedor ya existe`);
                return;
            }

            console.log(`Enviando petición de nuevo contenedor`);
            this.levantaContenedor(nodo, contenedor);

            console.log(`Esperando respuesta del deamon...`);
            let respuesta = await this.respuestaDeamon();
            console.log(`Respuesta del deamon: ${respuesta}`);

        } catch(err){
            console.log(err);
        }
    }

    async suspenderNodo(){

        try{
            // Enviar al deamon la petición
            console.log(`Enviando la petición al deamon, esperando respuesta...`);
            this.darmeDeBaja();

            let respuesta = await this.respuestaDeamon();
            console.log(`Respuesta del deamon: ${respuesta}`);

            this.cerrarConsola();
        
        } catch(err){
            console.log(err);
        }
    }

    cerrarConsola(){
        console.log("\nDesconectandome del deamon y cerrando interfaz");
        this.teclado.close();
        this.socketReq.close();
        process.exit(0);
    }

    // Proxy del deamon

    // En los proxys mandamos como primer elemento del array el método
    // y el resto son los argumentos

    configurameElNodo(subred){
        const metodo = 'configurameElNodo';
        const argumentos = subred;
        this.socketReq.send([metodo, argumentos]);
    }


    dameInfoSistema(){
        const metodo = 'dameInfoSistema';
        const argumentos = '';
        this.socketReq.send([metodo,argumentos]);
    }


    levantaContenedor(nodo, contenedor){
        const metodo = 'levantaContenedor';
        const argumentos = nodo + ',' + contenedor;
        this.socketReq.send([metodo, argumentos]);
    }

    eliminaContenedor(nombreCont, IP){
        const metodo = 'eliminaContenedor';
        const argumentos = nombreCont + ',' + IP;
        this.socketReq.send([metodo, argumentos]);
    }

    estasConfigurado(){
        const metodo = 'estasConfigurado';
        const argumentos = '';
        this.socketReq.send([metodo, argumentos]);
    }

    darmeDeBaja(){
        const metodo = 'darmeDeBaja';
        const argumentos = '';
        this.socketReq.send([metodo, argumentos]);
    }

}

const main = async () => {
    const puertoDeamon = process.argv[2] || 5002;

    const menu = new Menu(puertoDeamon);

    // Checkear si el nodo está configurado para configurarlo o no
    console.log(`Preguntando al deamon si está configurado, esperando respuesta...`);
    menu.estasConfigurado();
    let respuesta = await menu.respuestaDeamon();
    respuesta = respuesta.split(',');
    
    if (respuesta[0] === 'no'){
        console.log(`Respuesta del deamon: ${respuesta[1]}`);
        console.log(`Hay que configurarlo:`);
        await menu.configurarNodo();
    } else{
        console.log(`Respuesta del deamon: ${respuesta[1]}`);
        console.log(`Saltando al menú directamente...`);
    }
    

    // Para quitar la interfaz

    process.on('SIGINT', () => {
        console.log("\nDesconectandome del deamon y cerrando interfaz");
        menu.teclado.close();
        menu.socketReq.close();
        process.exit(0);
    });

    while (true){
        await menu.acciones();
    }
}

main();