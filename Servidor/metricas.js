const { exec } = require('child_process');



function comandoBash(comando){
    return new Promise((resolve,reject) => {
        exec(comando, (err,stdout,stderr) => {
            if (err){
                reject(err);
            } else{
                resolve([stdout,stderr]);
            }
        });
    });
}

const ejecutable = async () => {
    let [stdout, stderr] = await comandoBash(`top -b -n 1 | grep Cpu | awk '{print $8}'`);

    stdout = (100 - parseFloat(stdout.replace(',','.').slice(0,-1))).toFixed(1)+'%';
    console.log(stdout);
    console.log(typeof(stdout));

    let freeRAM;
    [freeRAM, stderr] = await comandoBash(`free -m | grep "Mem" | awk '{print $4+$6}'`);
    freeRAM = parseInt(freeRAM.slice(0,-1))+' Mb';
    console.log(freeRAM);
}

ejecutable();