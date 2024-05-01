const { spawn } = require('child_process');

const runScript = async () => {
  const script = spawn('node', ['index.js'], { stdio: 'inherit' });
  script.on('error', (error) => {
    console.error(`Error: ${error.message}`);
  });
  script.on('close', (code) => {
    console.log(`index.js exited with code ${code}`);
    console.log('Restarting index.js...');
    runScript(); // Recursively restart index.js upon exit
  });
};

runScript();
