const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = "/var/www/frozenthrone";
const queueDir = `${root}/public/renders/queue`;
const doneDir = `${root}/public/renders/done`;
const failedDir = `${root}/public/renders/failed`;

fs.mkdirSync(queueDir, { recursive: true });
fs.mkdirSync(doneDir, { recursive: true });
fs.mkdirSync(failedDir, { recursive: true });

const jobs = fs.readdirSync(queueDir)
  .filter(f => f.endsWith(".json"))
  .sort();

if (!jobs.length) {
  console.log("No render jobs queued.");
  process.exit(0);
}

for (const jobName of jobs) {
  const jobPath = path.join(queueDir, jobName);

  try {
    const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
    console.log(`Processing ${jobName}`);

    execFileSync("node", ["modules/renderer/render-character.js", job.inputFile], {
      cwd: root,
      stdio: "inherit"
    });

    fs.renameSync(jobPath, path.join(doneDir, jobName));
    console.log(`Done: ${jobName}`);
  } catch (err) {
    console.error(`Failed: ${jobName}`);
    console.error(err);
    fs.renameSync(jobPath, path.join(failedDir, jobName));
  }
}
