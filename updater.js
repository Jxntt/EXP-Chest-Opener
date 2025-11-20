const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { pipeline } = require("stream");
const { promisify } = require("util");

const streamPipeline = promisify(pipeline);

const GITHUB_REPO = "Jxntt/EXP-Chest-Opener"; 

let CURRENT_VERSION = "1.0.0";
try {
    const packageJson = require("./package.json");
    CURRENT_VERSION = packageJson.version;
} catch (error) {
    console.log("Could not read version from package.json, using default");
}

const COLORS = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    dim: "\x1b[2m",
};

const DownloadFile = async (url, destination) => {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                DownloadFile(response.headers.location, destination)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            const fileStream = fs.createWriteStream(destination);
            
            const totalBytes = parseInt(response.headers["content-length"], 10);
            let downloadedBytes = 0;
            let lastPercent = 0;

            response.on("data", (chunk) => {
                downloadedBytes += chunk.length;
                const percent = Math.floor((downloadedBytes / totalBytes) * 100);
                
                if (percent !== lastPercent && percent % 10 === 0) {
                    process.stdout.write(`\r    ${COLORS.cyan}Downloading... ${percent}%${COLORS.reset}`);
                    lastPercent = percent;
                }
            });

            streamPipeline(response, fileStream)
                .then(() => {
                    process.stdout.write(`\r    ${COLORS.green}✓ Download complete!${COLORS.reset}\n`);
                    resolve();
                })
                .catch(reject);
        }).on("error", reject);
    });
};

const ExtractZip = async (zipPath, extractTo) => {
    try {
        const AdmZip = require("adm-zip");
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractTo, true);
        return true;
    } catch (error) {
        try {
            if (process.platform === "win32") {
                execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractTo}' -Force"`, {
                    stdio: "ignore",
                });
            } else {
                execSync(`unzip -o "${zipPath}" -d "${extractTo}"`, { stdio: "ignore" });
            }
            return true;
        } catch (cmdError) {
            throw new Error("Could not extract ZIP file. Install dependencies with: npm install adm-zip");
        }
    }
};

const CopyFiles = (src, dest, exclude = []) => {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (exclude.includes(entry.name)) continue;

        if (entry.isDirectory()) {
            CopyFiles(srcPath, destPath, exclude);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
};

const DeleteDirectory = (dirPath) => {
    if (!fs.existsSync(dirPath)) return;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            DeleteDirectory(fullPath);
        } else {
            fs.unlinkSync(fullPath);
        }
    }

    fs.rmdirSync(dirPath);
};

const GetLatestVersion = () => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "api.github.com",
            path: `/repos/${GITHUB_REPO}/releases/latest`,
            method: "GET",
            headers: {
                "User-Agent": "Node.js Update Checker",
            },
        };

        https
            .get(options, (res) => {
                let data = "";

                res.on("data", (chunk) => {
                    data += chunk;
                });

                res.on("end", () => {
                    try {
                        if (res.statusCode === 404) {
                            resolve(null);
                            return;
                        }
                        const release = JSON.parse(data);
                        resolve({
                            version: release.tag_name.replace(/^v/, ""),
                            url: release.html_url,
                            zipball_url: release.zipball_url,
                            name: release.name,
                            body: release.body,
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            })
            .on("error", reject);
    });
};

const CompareVersions = (current, latest) => {
    const currentParts = current.split(".").map(Number);
    const latestParts = latest.split(".").map(Number);

    for (let i = 0; i < 3; i++) {
        if (latestParts[i] > currentParts[i]) return 1;
        if (latestParts[i] < currentParts[i]) return -1;
    }
    return 0;
};

const InstallUpdate = async (zipUrl) => {
    const tempDir = path.join(__dirname, ".update_temp");
    const zipPath = path.join(tempDir, "update.zip");

    try {
        console.log(`\n${COLORS.cyan}Preparing to update...${COLORS.reset}`);

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        console.log(`    ${COLORS.cyan}Downloading update...${COLORS.reset}`);
        await DownloadFile(zipUrl, zipPath);

        console.log(`    ${COLORS.cyan}Extracting files...${COLORS.reset}`);
        await ExtractZip(zipPath, tempDir);

        const extractedFolders = fs
            .readdirSync(tempDir, { withFileTypes: true })
            .filter((e) => e.isDirectory());

        if (extractedFolders.length === 0) {
            throw new Error("No folder found in extracted ZIP");
        }

        const extractedFolder = path.join(tempDir, extractedFolders[0].name);

        console.log(`    ${COLORS.cyan}Installing files...${COLORS.reset}`);
        CopyFiles(extractedFolder, __dirname, [
            "node_modules",
            "Data",
            ".git",
            ".update_temp",
            "disc.txt",
            "data.json",
        ]);

        console.log(`    ${COLORS.cyan}Cleaning up...${COLORS.reset}`);
        DeleteDirectory(tempDir);

        console.log(`    ${COLORS.cyan}Installing dependencies...${COLORS.reset}`);
        try {
            execSync("npm install", { stdio: "inherit" });
        } catch (error) {
            console.log(`    ${COLORS.yellow}⚠ Could not run npm install automatically${COLORS.reset}`);
            console.log(`    ${COLORS.dim}Please run: npm install${COLORS.reset}`);
        }

        console.log(`\n${COLORS.green}✓ Update completed successfully!${COLORS.reset}`);
        console.log(`${COLORS.yellow}Please restart the application.${COLORS.reset}\n`);

        return true;
    } catch (error) {
        console.log(`\n${COLORS.red}X Update failed: ${error.message}${COLORS.reset}`);
        
        try {
            if (fs.existsSync(tempDir)) {
                DeleteDirectory(tempDir);
            }
        } catch {}

        return false;
    }
};

const CheckForUpdates = async (prompt, force = false) => {
    try {
        const latest = await GetLatestVersion();

        if (!latest) {
            if (force) {
                console.log(`${COLORS.dim}No releases found on GitHub.${COLORS.reset}\n`);
            }
            return;
        }

        const comparison = CompareVersions(CURRENT_VERSION, latest.version);

        if (comparison < 0) {
            if (force) {
                console.log(
                    `${COLORS.green}✓${COLORS.reset} You're running a development version (${CURRENT_VERSION} > ${latest.version})\n`
                );
            }
            return;
        }

        if (comparison === 0) {
            if (force) {
                console.log(
                    `${COLORS.green}✓${COLORS.reset} You're running the latest version (${CURRENT_VERSION})\n`
                );
            }
            return;
        }

        console.log(
            `\n${COLORS.bright}${COLORS.yellow}╔════════════════════════════════════════════════╗${COLORS.reset}`
        );
        console.log(
            `${COLORS.bright}${COLORS.yellow}║${COLORS.reset}                    ${COLORS.bright}UPDATE AVAILABLE!${COLORS.reset}                                    ${COLORS.bright}${COLORS.yellow}║${COLORS.reset}`
        );
        console.log(
            `${COLORS.bright}${COLORS.yellow}╚════════════════════════════════════════════════╝${COLORS.reset}\n`
        );

        console.log(
            `    ${COLORS.dim}Current version:${COLORS.reset} ${COLORS.red}${CURRENT_VERSION}${COLORS.reset}`
        );
        console.log(
            `    ${COLORS.dim}Latest version:${COLORS.reset}    ${COLORS.green}${latest.version}${COLORS.reset}\n`
        );

        if (latest.name) {
            console.log(`    ${COLORS.bright}${latest.name}${COLORS.reset}`);
        }

        if (latest.body) {
            const shortBody = latest.body.split("\n").slice(0, 3).join("\n");
            console.log(`${COLORS.dim}${shortBody}${COLORS.reset}\n`);
        }

        console.log(`    ${COLORS.cyan}${latest.url}${COLORS.reset}\n`);

        const answer = prompt(
            `${COLORS.yellow}Would you like to install the update now?${COLORS.reset} (y/n): `
        );

        if (["y", "yes"].includes(answer.toLowerCase().trim())) {
            const success = await InstallUpdate(latest.zipball_url);
            if (success) {
                process.exit(0);
            }
        } else {
            console.log(
                `${COLORS.dim}Update skipped. You'll be notified again next time.${COLORS.reset}\n`
            );
        }
    } catch (error) {
        if (force) {
            console.log(
                `${COLORS.red}X${COLORS.reset} Failed to check for updates: ${error.message}\n`
            );
        }
    }
};

module.exports = {
    CheckForUpdates,
    CURRENT_VERSION,
    GITHUB_REPO,
};