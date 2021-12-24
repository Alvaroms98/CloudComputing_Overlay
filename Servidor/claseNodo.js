class Nodo{
    constructor(nombre,IP, cpu, RAM){
        this.nombre = nombre;
        this.IP = IP;
        this.cpu = cpu;
        this.RAM = RAM;        
    }
}

const array = [];


array.push(new Nodo('Zeus', '192.168.111.0/24', '75.2%', '2000 Mb'));
array.push(new Nodo('pepe', '192.168.1.0/24', '80.0%', '3000 Mb'));
// const stringarray = JSON.stringify(array);
// console.log(`${stringarray}`);

// const objectarray = JSON.parse(stringarray);
// console.log(objectarray);

let verificar = array.find(Activo => Activo.nombre === 'Zeus');
console.log(verificar);
if (typeof(verificar) === 'undefined'){
    console.log(`Ese nodo no existe`);
    return;
} else{
    console.log('si hay match');
}