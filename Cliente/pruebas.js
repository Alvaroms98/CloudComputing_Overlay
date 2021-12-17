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
    let [stdout, stderr] = await comandoBash("ls -l");
    console.log(stdout);
    console.log("hola", stderr);
}

if (existsSync('/run/netns')){
    console.log("dentro");
}
//ejecutarBash();