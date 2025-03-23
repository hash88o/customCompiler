#!/usr/bin/env node
const readline = require('readline');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const chalk = require('chalk'); // You'll need to install this: npm install chalk

// Shell history
const historyFile = path.join(os.homedir(), '.myshell_history');
let commandHistory = [];

// Load history if exists
try {
    if (fs.existsSync(historyFile)) {
        commandHistory = fs.readFileSync(historyFile, 'utf8').split('\n').filter(Boolean);
    }
} catch (err) {
    console.error('Could not load history file');
}

// Shell configuration
const shellConfig = {
    prompt: chalk.green('myshell') + chalk.blue('➜ '),
    showTimestamp: true,
    maxHistorySize: 1000
};

// Create the interface for reading commands from the user
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: shellConfig.prompt,
    historySize: shellConfig.maxHistorySize,
    completer: (line) => {
        // Simple tab completion for commands
        const commands = [...Object.keys(customCommands), 'ls', 'cd', 'pwd', 'cat', 'mkdir'];
        const hits = commands.filter((c) => c.startsWith(line));
        return [hits.length ? hits : commands, line];
    }
});

// Get current directory for display
const getCurrentDirectory = () => {
    const dir = process.cwd();
    const homedir = os.homedir();

    if (dir.startsWith(homedir)) {
        return '~' + dir.substring(homedir.length);
    }
    return dir;
};

// Update prompt to show current directory
const updatePrompt = () => {
    const currentDir = chalk.yellow(getCurrentDirectory());
    rl.setPrompt(chalk.green('myshell') + chalk.blue('[') + currentDir + chalk.blue(']➜ '));
};

// Custom Commands
const customCommands = {
    help: () => {
        console.log(chalk.cyan('Available custom commands:'));
        Object.keys(customCommands).sort().forEach(cmd => {
            console.log(`  ${chalk.green(cmd)}`);
        });
        console.log(chalk.cyan('\nStandard shell commands are also supported.'));
    },

    greet: () => {
        console.log(chalk.yellow('Hello, welcome to my custom shell!'));
    },

    echo: (args) => {
        console.log(args.join(' '));
    },

    clear: () => {
        console.clear();
    },

    exit: () => {
        saveHistory();
        console.log(chalk.yellow('Goodbye!'));
        rl.close();
    },

    history: (args) => {
        const limit = args[0] ? parseInt(args[0]) : commandHistory.length;
        commandHistory.slice(-limit).forEach((cmd, i) => {
            console.log(`${chalk.gray(commandHistory.length - limit + i + 1)} ${cmd}`);
        });
    },

    cd: (args) => {
        const newDir = args[0] || os.homedir();
        try {
            process.chdir(newDir);
            updatePrompt();
        } catch (err) {
            console.error(chalk.red(`cd: ${err.message}`));
        }
    },

    mkdir: (args) => {
        if (!args[0]) {
            console.error(chalk.red('mkdir: missing directory name'));
            return;
        }
        try {
            fs.mkdirSync(args[0], { recursive: true });
        } catch (err) {
            console.error(chalk.red(`mkdir: ${err.message}`));
        }
    },

    rm: (args) => {
        if (!args[0]) {
            console.error(chalk.red('rm: missing file or directory name'));
            return;
        }

        try {
            if (args.includes('-r') || args.includes('-rf')) {
                // Handle recursive deletion
                const dirIndex = args.findIndex(arg => !arg.startsWith('-'));
                if (dirIndex !== -1) {
                    fs.rmSync(args[dirIndex], { recursive: true, force: true });
                }
            } else {
                fs.unlinkSync(args[0]);
            }
        } catch (err) {
            console.error(chalk.red(`rm: ${err.message}`));
        }
    },

    ls: (args) => {
        const target = args.filter(arg => !arg.startsWith('-'))[0] || '.';
        const showHidden = args.includes('-a') || args.includes('-la') || args.includes('-al');

        try {
            const files = fs.readdirSync(target);
            files
                .filter(file => showHidden || !file.startsWith('.'))
                .forEach(file => {
                    try {
                        const stats = fs.statSync(path.join(target, file));
                        if (stats.isDirectory()) {
                            console.log(chalk.blue(file + '/'));
                        } else if (stats.isFile() && (stats.mode & 0o111)) { // Executable
                            console.log(chalk.green(file + '*'));
                        } else {
                            console.log(file);
                        }
                    } catch (err) {
                        console.log(file);
                    }
                });
        } catch (err) {
            console.error(chalk.red(`ls: ${err.message}`));
        }
    },

    cat: (args) => {
        if (!args[0]) {
            console.error(chalk.red('cat: missing file name'));
            return;
        }
        try {
            const content = fs.readFileSync(args[0], 'utf8');
            console.log(content);
        } catch (err) {
            console.error(chalk.red(`cat: ${err.message}`));
        }
    },

    date: () => {
        console.log(new Date().toString());
    },

    touch: (args) => {
        if (!args[0]) {
            console.error(chalk.red('touch: missing file name'));
            return;
        }
        try {
            const time = new Date();
            fs.utimesSync(args[0], time, time);
        } catch (err) {
            // File doesn't exist, create it
            try {
                fs.writeFileSync(args[0], '');
            } catch (err) {
                console.error(chalk.red(`touch: ${err.message}`));
            }
        }
    },

    pwd: () => {
        console.log(process.cwd());
    },

    alias: (args) => {
        if (args.length < 2) {
            console.log(chalk.red('Usage: alias name=command'));
            return;
        }

        const aliasStr = args.join(' ');
        const match = aliasStr.match(/(\w+)=(.+)/);

        if (match) {
            const [, name, command] = match;
            customCommands[name] = () => executeCommand(command);
            console.log(chalk.green(`Alias created: ${name}`));
        } else {
            console.log(chalk.red('Invalid alias format. Use: alias name=command'));
        }
    },

    find: (args) => {
        if (args.length < 2) {
            console.log(chalk.red('Usage: find [path] -name [pattern]'));
            return;
        }

        const dir = args[0];
        const nameIndex = args.indexOf('-name');
        if (nameIndex === -1 || nameIndex === args.length - 1) {
            console.log(chalk.red('Missing name pattern'));
            return;
        }

        const pattern = args[nameIndex + 1];

        const findInDir = (currentDir, pattern) => {
            try {
                const files = fs.readdirSync(currentDir);

                files.forEach(file => {
                    const filePath = path.join(currentDir, file);

                    if (file.includes(pattern)) {
                        console.log(filePath);
                    }

                    try {
                        const stats = fs.statSync(filePath);
                        if (stats.isDirectory()) {
                            findInDir(filePath, pattern);
                        }
                    } catch (err) {
                        // Skip if can't access
                    }
                });
            } catch (err) {
                console.error(chalk.red(`find: ${err.message}`));
            }
        };

        findInDir(dir, pattern);
    },

    // Weather command - fetches weather information
    weather: (args) => {
        const location = args.join(' ') || 'London';
        console.log(chalk.yellow(`Fetching weather for ${location}...`));

        exec(`curl -s wttr.in/${encodeURIComponent(location)}?format=3`, (err, stdout, stderr) => {
            if (err) {
                console.error(chalk.red(`Error fetching weather: ${err.message}`));
            } else {
                console.log(stdout);
            }
        });
    },

    // IP command - shows your public IP address
    myip: () => {
        console.log(chalk.yellow('Fetching your public IP address...'));

        exec('curl -s https://api.ipify.org', (err, stdout, stderr) => {
            if (err) {
                console.error(chalk.red(`Error fetching IP: ${err.message}`));
            } else {
                console.log(chalk.green(`Your public IP: ${stdout}`));
            }
        });
    },

    // Joke command - fetches a random joke
    joke: () => {
        console.log(chalk.yellow('Fetching a joke...'));

        exec('curl -s https://icanhazdadjoke.com', { env: { ...process.env, 'ACCEPT': 'application/json' } }, (err, stdout, stderr) => {
            if (err) {
                console.error(chalk.red(`Error fetching joke: ${err.message}`));
            } else {
                try {
                    const joke = JSON.parse(stdout).joke;
                    console.log(chalk.cyan(joke));
                } catch (e) {
                    console.log(stdout);
                }
            }
        });
    },

    // ASCII art banner
    banner: (args) => {
        const text = args.join(' ') || 'My Shell';
        console.log(chalk.yellow('Generating banner...'));

        exec(`figlet "${text}"`, (err, stdout, stderr) => {
            if (err) {
                // If figlet is not installed, create a simple banner
                console.log('\n' + '='.repeat(text.length + 4));
                console.log(`| ${text} |`);
                console.log('='.repeat(text.length + 4) + '\n');
                console.log(chalk.red('For better banners, install figlet: npm install -g figlet'));
            } else {
                console.log(chalk.cyan(stdout));
            }
        });
    },

    // System information display
    sysinfo: () => {
        console.log(chalk.yellow('System Information:'));
        console.log(chalk.cyan('OS:'), os.type(), os.release());
        console.log(chalk.cyan('Architecture:'), os.arch());
        console.log(chalk.cyan('CPU:'), os.cpus()[0].model);
        console.log(chalk.cyan('Cores:'), os.cpus().length);
        console.log(chalk.cyan('Memory:'), (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2), 'GB');
        console.log(chalk.cyan('Free Memory:'), (os.freemem() / (1024 * 1024 * 1024)).toFixed(2), 'GB');
        console.log(chalk.cyan('Uptime:'), (os.uptime() / 3600).toFixed(2), 'hours');
    },

    // URL shortener
    shorten: (args) => {
        const url = args[0];
        if (!url) {
            console.error(chalk.red('Please provide a URL to shorten'));
            return;
        }

        console.log(chalk.yellow(`Shortening URL: ${url}`));

        exec(`curl -s https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, (err, stdout, stderr) => {
            if (err) {
                console.error(chalk.red(`Error shortening URL: ${err.message}`));
            } else {
                console.log(chalk.green(`Shortened URL: ${stdout}`));
            }
        });
    },

    // QR code generator
    qrcode: (args) => {
        const data = args.join(' ');
        if (!data) {
            console.error(chalk.red('Please provide data to encode as QR'));
            return;
        }

        console.log(chalk.yellow(`Creating QR code for: ${data}`));

        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data)}`;
        console.log(chalk.green(`QR code URL: ${qrUrl}`));
        console.log(chalk.cyan('Open this URL in your browser to see the QR code'));
    },

    // Password generator
    genpass: (args) => {
        const length = parseInt(args[0]) || 12;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
        let password = '';

        for (let i = 0; i < length; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        console.log(chalk.green(`Generated password: ${password}`));
    },

    // Countdown timer
    countdown: (args) => {
        const seconds = parseInt(args[0]) || 10;
        let remainingTime = seconds;

        console.log(chalk.yellow(`Starting countdown for ${seconds} seconds...`));

        const timer = setInterval(() => {
            process.stdout.write(`\r${chalk.cyan(remainingTime)} seconds remaining...`);
            remainingTime--;

            if (remainingTime < 0) {
                clearInterval(timer);
                console.log('\n' + chalk.green('Countdown finished!'));
            }
        }, 1000);
    },

    // Pomodoro timer
    pomodoro: (args) => {
        const workTime = parseInt(args[0]) || 25;
        const breakTime = parseInt(args[1]) || 5;
        let isWorking = true;
        let timeLeft = workTime * 60;

        console.log(chalk.green(`Starting Pomodoro: ${workTime} min work, ${breakTime} min break`));

        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs < 10 ? '0' + secs : secs}`;
        };

        const timer = setInterval(() => {
            process.stdout.write(`\r${isWorking ? chalk.red('WORK') : chalk.green('BREAK')}: ${formatTime(timeLeft)} remaining`);
            timeLeft--;

            if (timeLeft < 0) {
                isWorking = !isWorking;
                timeLeft = (isWorking ? workTime : breakTime) * 60;
                console.log('\n' + chalk.yellow(`Switching to ${isWorking ? 'WORK' : 'BREAK'} time!`));
            }
        }, 1000);

        // Allow stopping the timer with Ctrl+C
        process.on('SIGINT', () => {
            clearInterval(timer);
            console.log('\n' + chalk.yellow('Pomodoro timer stopped.'));
            rl.prompt();
        });
    },

    // Dictionary lookup
    define: (args) => {
        const word = args[0];
        if (!word) {
            console.error(chalk.red('Please provide a word to look up'));
            return;
        }

        console.log(chalk.yellow(`Looking up definition for: ${word}`));

        exec(`curl -s https://api.dictionaryapi.dev/api/v2/entries/en/${word}`, (err, stdout, stderr) => {
            if (err) {
                console.error(chalk.red(`Error looking up word: ${err.message}`));
            } else {
                try {
                    const data = JSON.parse(stdout);
                    if (Array.isArray(data) && data.length > 0) {
                        const entry = data[0];
                        console.log(chalk.cyan(`Word: ${entry.word}`));

                        if (entry.phonetics && entry.phonetics.length > 0) {
                            console.log(chalk.cyan(`Pronunciation: ${entry.phonetics[0].text || 'N/A'}`));
                        }

                        if (entry.meanings && entry.meanings.length > 0) {
                            entry.meanings.forEach((meaning, i) => {
                                console.log(chalk.yellow(`\n${meaning.partOfSpeech}:`));

                                meaning.definitions.slice(0, 3).forEach((def, j) => {
                                    console.log(chalk.white(`  ${j + 1}. ${def.definition}`));
                                    if (def.example) {
                                        console.log(chalk.gray(`     Example: "${def.example}"`));
                                    }
                                });
                            });
                        }
                    } else {
                        console.log(chalk.red(`No definition found for ${word}`));
                    }
                } catch (e) {
                    console.error(chalk.red(`Error parsing response: ${e.message}`));
                }
            }
        });
    },

    // Currency converter
    convert: (args) => {
        if (args.length < 3) {
            console.error(chalk.red('Usage: convert [amount] [from] [to]'));
            console.error(chalk.red('Example: convert 100 USD EUR'));
            return;
        }

        const amount = parseFloat(args[0]);
        const from = args[1].toUpperCase();
        const to = args[2].toUpperCase();

        console.log(chalk.yellow(`Converting ${amount} ${from} to ${to}...`));

        exec(`curl -s "https://api.exchangerate.host/convert?from=${from}&to=${to}&amount=${amount}"`, (err, stdout, stderr) => {
            if (err) {
                console.error(chalk.red(`Error converting currency: ${err.message}`));
            } else {
                try {
                    const data = JSON.parse(stdout);
                    if (data.success && data.result) {
                        console.log(chalk.green(`${amount} ${from} = ${data.result.toFixed(2)} ${to}`));
                        console.log(chalk.gray(`Exchange rate: 1 ${from} = ${data.info.rate.toFixed(4)} ${to}`));
                    } else {
                        console.error(chalk.red('Currency conversion failed'));
                    }
                } catch (e) {
                    console.error(chalk.red(`Error parsing response: ${e.message}`));
                }
            }
        });
    },

    // Memory usage monitor
    memwatch: (args) => {
        const seconds = parseInt(args[0]) || 5;
        console.log(chalk.yellow(`Monitoring memory usage every ${seconds} seconds. Press Ctrl+C to stop.`));

        const printMemory = () => {
            const used = process.memoryUsage();
            console.log(chalk.cyan('Memory Usage:'));
            console.log(chalk.white(`  RSS: ${(used.rss / 1024 / 1024).toFixed(2)} MB`));
            console.log(chalk.white(`  Heap Total: ${(used.heapTotal / 1024 / 1024).toFixed(2)} MB`));
            console.log(chalk.white(`  Heap Used: ${(used.heapUsed / 1024 / 1024).toFixed(2)} MB`));
            console.log(chalk.white(`  External: ${(used.external / 1024 / 1024).toFixed(2)} MB`));
            console.log(chalk.gray(`  System Free: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB / ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`));
        };

        printMemory();
        const interval = setInterval(printMemory, seconds * 1000);

        // Allow stopping with Ctrl+C
        process.on('SIGINT', () => {
            clearInterval(interval);
            console.log('\n' + chalk.yellow('Memory monitoring stopped.'));
            rl.prompt();
        });
    }
};

// Function to save command history
const saveHistory = () => {
    try {
        fs.writeFileSync(historyFile, commandHistory.slice(-shellConfig.maxHistorySize).join('\n'));
    } catch (err) {
        console.error('Could not save history file');
    }
};

// Function to execute system commands
const executeCommand = (command) => {
    const args = command.split(' ');
    const cmd = args[0];

    if (customCommands[cmd]) {
        customCommands[cmd](args.slice(1));
    } else {
        exec(command, (err, stdout, stderr) => {
            if (err) {
                console.error(chalk.red(`Error: ${err.message}`));
            } else if (stderr) {
                console.error(chalk.red(`stderr: ${stderr}`));
            } else {
                console.log(stdout);
            }
        });
    }
};

// Function to handle piping (`|`) and redirection (`>`, `>>`, `<`)
const handlePipesAndRedirects = (input) => {
    // Add to history
    commandHistory.push(input);

    // Handle multiple commands separated by semicolons
    if (input.includes(';')) {
        const commands = input.split(';');
        commands.forEach(cmd => {
            handlePipesAndRedirects(cmd.trim());
        });
        return;
    }

    // Handle redirecting input from file
    if (input.includes('<')) {
        const [command, inputFile] = input.split('<').map(part => part.trim());
        try {
            const inputContent = fs.readFileSync(inputFile, 'utf8');
            const child = spawn('sh', ['-c', command], { stdio: 'pipe' });

            child.stdin.write(inputContent);
            child.stdin.end();

            child.stdout.on('data', (data) => {
                console.log(data.toString());
            });

            child.stderr.on('data', (data) => {
                console.error(chalk.red(data.toString()));
            });

            return;
        } catch (err) {
            console.error(chalk.red(`Error reading input file: ${err.message}`));
            return;
        }
    }

    const pipeCommands = input.split('|');
    if (pipeCommands.length > 1) {
        // Handle pipe
        let firstCommand = true;
        let lastProcess = null;

        pipeCommands.forEach((command, index) => {
            const trimmedCommand = command.trim();
            const commandArgs = trimmedCommand.split(' ');
            const [cmd, ...args] = commandArgs;

            try {
                const process = spawn(cmd, args);

                if (firstCommand) {
                    firstCommand = false;
                } else {
                    lastProcess.stdout.pipe(process.stdin);
                }

                process.stdout.on('data', (data) => {
                    if (index === pipeCommands.length - 1) {
                        console.log(data.toString());
                    }
                });

                process.stderr.on('data', (data) => {
                    console.error(chalk.red(data.toString()));
                });

                lastProcess = process;
            } catch (err) {
                console.error(chalk.red(`Error executing command: ${err.message}`));
            }
        });
    } else {
        // Handle redirection (>, >>)
        if (input.includes('>>')) {
            const [command, file] = input.split('>>');
            const outputStream = fs.createWriteStream(file.trim(), { flags: 'a' });
            const cmdArgs = command.trim().split(' ');
            const [cmd, ...args] = cmdArgs;

            try {
                const process = spawn(cmd, args);
                process.stdout.pipe(outputStream);
                process.stderr.on('data', (data) => {
                    console.error(chalk.red(data.toString()));
                });
            } catch (err) {
                console.error(chalk.red(`Error executing command: ${err.message}`));
            }
        } else if (input.includes('>')) {
            const [command, file] = input.split('>');
            const outputStream = fs.createWriteStream(file.trim(), { flags: 'w' });
            const cmdArgs = command.trim().split(' ');
            const [cmd, ...args] = cmdArgs;

            try {
                const process = spawn(cmd, args);
                process.stdout.pipe(outputStream);
                process.stderr.on('data', (data) => {
                    console.error(chalk.red(data.toString()));
                });
            } catch (err) {
                console.error(chalk.red(`Error executing command: ${err.message}`));
            }
        } else {
            // No pipes or redirects, just execute the command
            executeCommand(input);
        }
    }
};

// Add keyboard shortcuts
process.stdin.on('keypress', (str, key) => {
    // Ctrl+C to interrupt command
    if (key.ctrl && key.name === 'c') {
        console.log('^C');
        rl.prompt();
    }

    // Ctrl+L to clear screen
    if (key.ctrl && key.name === 'l') {
        console.clear();
        rl.prompt();
    }
});

// Display welcome message
console.log(chalk.cyan('Welcome to Enhanced Shell!'));
console.log(chalk.cyan('Type "help" to see available commands.'));

// Initialize prompt with current directory
updatePrompt();

// The shell main loop
rl.prompt();
rl.on('line', (line) => {
    const input = line.trim();

    if (input) {
        const timestamp = new Date().toISOString();
        if (shellConfig.showTimestamp) {
            console.log(chalk.gray(`[${timestamp}]`));
        }

        handlePipesAndRedirects(input);
    }

    rl.prompt();
}).on('close', () => {
    saveHistory();
    console.log(chalk.yellow('Goodbye!'));
    process.exit(0);
});