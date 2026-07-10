// Jednoduchý JSX parser na formátování Markdown textu (tučné, kurzíva,
// seznamy, tabulky). Vlastní soubor mimo komponenty kvůli Fast Refresh —
// soubor s komponentou smí exportovat jen komponenty.

export function formatCategoryMarkdown(text) {
    if (!text) return null

    const lines = text.split('\n')
    const elements = []
    let inTable = false
    let tableRows = []
    let listType = null // 'ul' | 'ol' | null
    let listItems = []

    const flushList = (key) => {
        if (!listType) return
        const Tag = listType
        elements.push(
            <Tag key={key} className={`category-detail-${listType}`}>
                {listItems.map((item, idx) => (
                    <li key={idx}>{parseInlineFormatting(item)}</li>
                ))}
            </Tag>
        )
        listItems = []
        listType = null
    }

    const flushTable = (key) => {
        if (tableRows.length === 0) return
        const headers = tableRows[0]
        const dataRows = tableRows.slice(1)
        elements.push(
            <div className="category-detail-table-wrapper" key={key}>
                <table className="category-detail-table">
                    <thead>
                        <tr>
                            {headers.map((cell, cIdx) => (
                                <th key={cIdx}>{parseInlineFormatting(cell)}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {dataRows.map((row, idx) => (
                            <tr key={idx}>
                                {row.map((cell, cIdx) => (
                                    <td key={cIdx}>{parseInlineFormatting(cell)}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
        tableRows = []
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()

        if (trimmed === '[TABULKA_START]') {
            flushList(`list-before-table-${i}`)
            inTable = true
            continue
        }
        if (trimmed === '[TABULKA_KONEC]') {
            flushTable(`table-${i}`)
            inTable = false
            continue
        }
        if (inTable) {
            if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                const cells = trimmed
                    .slice(1, -1)
                    .split('|')
                    .map(c => c.trim())
                tableRows.push(cells)
            }
            continue
        }

        const bulletMatch = line.match(/^(\s*)-\s+(.*)$/)
        const decimalMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/)

        if (bulletMatch) {
            if (listType !== 'ul') {
                flushList(`list-before-ul-${i}`)
                listType = 'ul'
            }
            listItems.push(bulletMatch[2])
            continue
        } else if (decimalMatch) {
            if (listType !== 'ol') {
                flushList(`list-before-ol-${i}`)
                listType = 'ol'
            }
            listItems.push(decimalMatch[3])
            continue
        } else {
            flushList(`list-before-para-${i}`)
        }

        if (trimmed) {
            elements.push(
                <p key={`p-${i}`} className="category-detail-p">
                    {parseInlineFormatting(trimmed)}
                </p>
            )
        }
    }

    flushList('list-final')
    flushTable('table-final')

    return elements
}

function parseInlineFormatting(text) {
    if (!text) return ''

    const tripleRegex = /\*\*\*([^*]+)\*\*\*/g
    const doubleRegex = /\*\*([^*]+)\*\*/g
    const singleRegex = /\*([^*]+)\*/g

    let tokens = [{ type: 'plain', text: text }]

    const runRegex = (regex, type) => {
        let nextTokens = []
        for (const t of tokens) {
            if (t.type !== 'plain') {
                nextTokens.push(t)
                continue
            }
            const parts = t.text.split(regex)
            for (let i = 0; i < parts.length; i++) {
                if (i % 2 === 1) {
                    nextTokens.push({ type: type, text: parts[i] })
                } else if (parts[i]) {
                    nextTokens.push({ type: 'plain', text: parts[i] })
                }
            }
        }
        tokens = nextTokens
    }

    runRegex(tripleRegex, 'bold-italic')
    runRegex(doubleRegex, 'bold')
    runRegex(singleRegex, 'italic')

    return tokens.map((tok, idx) => {
        if (tok.type === 'bold-italic') {
            return <strong key={idx}><em>{tok.text}</em></strong>
        }
        if (tok.type === 'bold') {
            return <strong key={idx}>{tok.text}</strong>
        }
        if (tok.type === 'italic') {
            return <em key={idx}>{tok.text}</em>
        }
        return tok.text
    })
}
