const { readFile, writeFile, readdir } = require('fs/promises')
const { resolve } = require('path')

require('dotenv').config({ path: resolve(__dirname, '..','.env') });

async function replaceEnv(fileName) {
    const file = await readFile(resolve(__dirname, fileName), 'utf8')
    const content = file.replace(/\$\{[^}]+\}/g, (pattern) => {
        return process.env[pattern.match(/[^${}]+/)[0]]
    })
    return writeFile(resolve(__dirname, fileName.replace('_template', '')), content, 'utf8')
}

async function main() {
    try {
        const filenames = await readdir(resolve(__dirname))
        const templates = filenames.filter(_ => _.endsWith('_template.sql'))

        Promise.all(templates.map(_ => replaceEnv(_)))        
    } catch(_) {
        console.error(_)
    }
}

main()
