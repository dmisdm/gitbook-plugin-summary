const fs = require("fs"),
  glob = require("glob"),
  path = require("path"),
  Parser = require("markdown-parser");
const dirTree = require("directory-tree");
const escapeStringRegexp = require("escape-string-regexp");
const async = require("async-q");
const parser = new Parser();
const R = require("ramda");
function generateEntry(title, path, readmeFilename) {
  let depth = path.match(/\//g).length;

  if (path.indexOf(readmeFilename) == -1) depth++;

  return `${Array(depth).join("    ")}- [${title}](${path})\n`;
}

const getEntryForDir = dir => {
  return async
    .map(
      dir.children.sort((a, b) => (a.name === "README.md" ? -1 : 0)),
      item => {
        const { path, name, extension, type, children } = item;
        if (extension === ".md") {
          return new Promise((resolve, reject) =>
            parser.parse(
              fs.readFileSync(path),
              (err, result) => (err ? reject(err) : resolve(result))
            )
          )
            .then(
              result =>
                result.headings && result.headings.length
                  ? result.headings[0].trim()
                  : name.replace(extension, "")
            )
            .catch(() => name.replace(extension, ""))
            .then(
              title =>
                name === "README.md"
                  ? `- [${title}](${path})`
                  : `  - [${title}](${path})`
            );
        }
        if (type === "directory" && children && children.length) {
          return getEntryForDir(item).then(names =>
            names.map(name => `  ${name}`)
          );
        }
        return Promise.resolve();
      }
    )
    .then(names => names.filter(i => !!i))
    .then(R.flatten);
};

module.exports = {
  hooks: {
    init: async function() {
      const parser = new Parser(),
        root = this.resolve(""),
        bookTitle = this.config.get("title"),
        readmeFilename = this.config.get("structure.readme"),
        summaryFilename = this.config.get("structure.summary"),
        pluginConfig = this.config.get("pluginsConfig.summary");

      const excludedPatterns = pluginConfig.excludedPatterns;
      let ret = Promise.resolve(),
        summaryContent = bookTitle ? `# ${bookTitle}\n\n` : "";

      const tree = dirTree(root, {
        extensions: /\.md$/,
        exclude: new RegExp(
          `(${["node_modules", "_book", ...excludedPatterns].join("|")})`
        )
      });

      console.log(await getEntryForDir(tree));

      glob(
        `*/**/*.md`,
        {
          cwd: root,
          ignore: ["node_modules/**"]
        },
        (err, files) => {
          files.forEach(filePath => {
            ret = ret.then(() => {
              return new Promise((resolve, reject) => {
                parser.parse(
                  fs.readFileSync(`${root}/${filePath}`, { encoding: "utf8" }),
                  (err, result) => {
                    if (result.headings.length) {
                      const fileTitle = result.headings[0].trim();

                      summaryContent += generateEntry(
                        fileTitle,
                        filePath,
                        readmeFilename
                      );
                    } else resolve();
                  }
                );
              });
            });
          });

          ret = ret.then(() => {
            fs.writeFileSync(`${root}/${summaryFilename}`, summaryContent, {
              encoding: "utf8"
            });

            console.log(
              `\x1b[36mgitbook-plugin-summary: \x1b[32m${summaryFilename} generated successfully.`
            );

            return Promise.resolve();
          });
        }
      );

      return ret;
    }
  }
};
