// Minimal parser for `git diff` output (unified format, any context size).
// It extracts, per file: old/new path, status, file modes and the line numbers
// that were added or changed in the new version of the file.

function unquote(path) {
  // git quotes paths with unusual characters: "a/some\tpath". Keep it simple and
  // reject such paths later in the policy check rather than decoding escapes.
  if (path.startsWith('"') && path.endsWith('"')) return path.slice(1, -1)
  return path
}

function stripPrefix(path, prefix) {
  const value = unquote(path)
  if (value === '/dev/null') return null
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

function parseHeaderPaths(line) {
  // "diff --git a/x b/y" — paths without spaces are the only ones we accept.
  const match = /^diff --git (\S+) (\S+)$/.exec(line)
  if (!match) return { oldPath: null, newPath: null, malformed: true }
  return { oldPath: stripPrefix(match[1], 'a/'), newPath: stripPrefix(match[2], 'b/'), malformed: false }
}

/**
 * @param {string} text output of `git diff`
 * @returns {Array<{oldPath: string|null, newPath: string|null, path: string, status: string,
 *   oldMode?: string, newMode?: string, binary: boolean, malformed: boolean,
 *   addedLines: number[], additions: number, deletions: number}>}
 */
export function parseDiff(text) {
  const files = []
  let current = null
  let newLine = 0

  const finish = () => {
    if (!current) return
    current.path = current.newPath ?? current.oldPath
    files.push(current)
  }

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      finish()
      const paths = parseHeaderPaths(line)
      current = {
        ...paths,
        path: '',
        status: 'modified',
        binary: false,
        addedLines: [],
        additions: 0,
        deletions: 0,
        inHunk: false,
      }
      continue
    }
    if (!current) continue

    if (!current.inHunk) {
      if (line.startsWith('new file mode ')) {
        current.status = 'added'
        current.newMode = line.slice('new file mode '.length).trim()
      } else if (line.startsWith('deleted file mode ')) {
        current.status = 'deleted'
        current.oldMode = line.slice('deleted file mode '.length).trim()
      } else if (line.startsWith('old mode ')) {
        current.oldMode = line.slice('old mode '.length).trim()
      } else if (line.startsWith('new mode ')) {
        current.newMode = line.slice('new mode '.length).trim()
        if (current.status === 'modified') current.status = 'mode-changed'
      } else if (line.startsWith('rename from ')) {
        current.status = 'renamed'
        current.oldPath = unquote(line.slice('rename from '.length))
      } else if (line.startsWith('rename to ')) {
        current.status = 'renamed'
        current.newPath = unquote(line.slice('rename to '.length))
      } else if (line.startsWith('copy from ') || line.startsWith('copy to ')) {
        current.status = 'copied'
      } else if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
        current.binary = true
      } else if (line.startsWith('--- ')) {
        const old = stripPrefix(line.slice(4).trim(), 'a/')
        if (old === null) {
          current.status = 'added'
          current.oldPath = null
        }
      } else if (line.startsWith('+++ ')) {
        const next = stripPrefix(line.slice(4).trim(), 'b/')
        if (next === null) {
          current.status = 'deleted'
          current.newPath = null
        }
      }
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (hunk) {
      current.inHunk = true
      newLine = Number(hunk[1])
      continue
    }
    if (!current.inHunk) continue
    if (line.startsWith('+')) {
      current.addedLines.push(newLine)
      current.additions += 1
      newLine += 1
    } else if (line.startsWith('-')) {
      current.deletions += 1
    } else if (line.startsWith(' ')) {
      newLine += 1
    }
    // "\ No newline at end of file" and empty trailing lines are ignored.
  }
  finish()
  for (const file of files) delete file.inHunk
  return files
}
