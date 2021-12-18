const { exec, spawn } = require('child_process');
const { existsSync } = require('fs');
const { path } = require('path');

const comandoBash = (comando) => {
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


const ejecutarBash = async () => {
    let [stdout, stderr] = await comandoBash("sudo iptables -t nat -S");
    let match = stdout.split('\n').find(line => line === `-P PREROUTINfG ACCEPT`);
    
    if (typeof(match) === 'undefined'){
        console.log("No se ha encontrado");
    } else{
        console.log("Si se ha encontrado");
    }
    //console.log("hola", stderr);
}

// if (existsSync('/run/netns')){
//     console.log("dentro");
// }
ejecutarBash();