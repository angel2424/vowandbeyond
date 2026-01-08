export const prerender = false

import type { APIRoute } from 'astro'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium-min'
import { getSupabaseAuthedClient } from '../../../lib/supabase'

type RSVPRow = {
  full_name: string
  guests_count: number
  phone: string | null
  notes: string | null
  attending: boolean
}

export const GET: APIRoute = async ({ cookies }) => {
  const access = cookies.get('sb-access-token')?.value
  if (!access) {
    return new Response('No autorizado', { status: 401 })
  }

  const supabase = getSupabaseAuthedClient(access)
  const { data, error } = await supabase
    .from('rsvps')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Supabase PDF fetch error:', error)
    return new Response('No se pudo obtener la lista de invitados.', { status: 500 })
  }

  try {
    const pdfBuffer = await renderPdf(data ?? [])
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="invitados-boda.pdf"',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return new Response('No se pudo generar el PDF.', { status: 500 })
  }
}

async function renderPdf(rows: RSVPRow[]) {
  const isProduction = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION

  let executablePath: string
  let launchArgs: string[]

  if (isProduction) {
    // Production (Vercel/AWS Lambda)
    executablePath = await chromium.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'
    )
    launchArgs = chromium.args
  } else {
    // Local development
    executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' || // macOS
      '/usr/bin/google-chrome' || // Linux
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' // Windows

    launchArgs = ['--no-sandbox', '--disable-setuid-sandbox']
  }

  const stats = summarize(rows)
  const generatedOn = formatDate(new Date())
  const html = buildHtml(rows, stats, generatedOn)

  let browser
  try {
    browser = await puppeteer.launch({
      args: launchArgs,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    })

    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '16mm',
        right: '14mm',
        bottom: '16mm',
        left: '14mm',
      },
      preferCSSPageSize: true,
    })

    return pdf
  } catch (err) {
    console.error('Browser launch or PDF generation failed:', err)
    throw err
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

function summarize(rows: RSVPRow[]) {
  const confirmed = rows.filter((r) => r.attending).length
  const pending = rows.length - confirmed
  const guests = rows.reduce(
    (acc, r) => acc + (Number.isFinite(r.guests_count) ? r.guests_count : 0),
    0
  )

  return { confirmed, pending, guests, total: rows.length }
}

function formatDate(date: Date) {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

function buildHtml(rows: RSVPRow[], stats: ReturnType<typeof summarize>, generatedOn: string) {
  const tableRows = rows
    .map(
      (row, index) => `
        <tr class="${index % 2 === 0 ? 'striped' : ''}">
          <td>${escapeHtml(row.full_name || '')}</td>
          <td>${Number.isFinite(row.guests_count) ? row.guests_count : '-'}</td>
          <td>${escapeHtml(row.phone || '—')}</td>
          <td>${escapeHtml(row.notes || '—')}</td>
          <td class="${row.attending ? 'yes' : 'no'}">${row.attending ? 'Sí' : 'No'}</td>
        </tr>
      `
    )
    .join('')

  return /* html */ `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Invitados | Boda Rosaura & José</title>
        <style>
          :root {
            --brand: #00674f;
            --brand-soft: #e8f4f0;
            --text: #1f1a17;
            --muted: #5d514b;
            --border: #e6dcd5;
          }

          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "IBM Plex Serif", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            color: var(--text);
          }
          .page {
            padding: 20px 10px 10px;
          }
          header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 16px;
          }
          h1 {
            margin: 0 0 6px;
            font-size: 22px;
            color: var(--brand);
            letter-spacing: 0.03em;
          }
          p {
            margin: 0;
            color: var(--muted);
            font-size: 12px;
          }
          .pill {
            display: inline-block;
            padding: 6px 10px;
            border-radius: 999px;
            background: var(--brand-soft);
            color: var(--brand);
            font-weight: 600;
            font-size: 11px;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            margin-bottom: 16px;
          }
          .meta {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 8px;
            margin: 10px 0 16px;
          }
          .meta-card {
            background: white;
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 10px 12px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.04);
          }
          .meta-title {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            color: var(--muted);
            margin: 0 0 4px;
          }
          .meta-value {
            margin: 0;
            font-size: 18px;
            color: var(--text);
            font-weight: 600;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid var(--border);
          }
          thead th {
            text-align: left;
            padding: 10px 12px;
            font-size: 12px;
            letter-spacing: 0.02em;
            text-transform: uppercase;
            background: var(--brand-soft);
            color: var(--brand);
            border-bottom: 1px solid var(--border);
          }
          td {
            padding: 10px 12px;
            font-size: 12px;
            line-height: 1.4;
            color: var(--text);
          }
          tbody tr.striped td {
            background: #F4FEFA;
          }
          td:last-child {
            font-weight: 700;
          }
          td.yes {
            color: #0f7b5c;
          }
          td.no {
            color: #b3532f;
          }
          footer {
            margin-top: 12px;
            text-align: center;
            font-size: 10px;
            color: var(--muted);
          }
        </style>
      </head>
      <body>
        <div class="page">
          <header>
            <div>
              <span class="pill">Lista de invitados con RSVP</span>
              <h1 class="title">Boda Rosaura & José</h1>
              <p>Lista de invitados generada: ${generatedOn}</p>
            </div>
          </header>

          <div class="meta">
            <div class="meta-card">
              <p class="meta-title">Invitados registrados</p>
              <p class="meta-value">${stats.total}</p>
            </div>
            <div class="meta-card">
              <p class="meta-title">Confirmados</p>
              <p class="meta-value">${stats.confirmed}</p>
            </div>
            <div class="meta-card">
              <p class="meta-title">Pendientes</p>
              <p class="meta-value">${stats.pending}</p>
            </div>
            <div class="meta-card">
              <p class="meta-title"># Total invitados declarados</p>
              <p class="meta-value">${stats.guests}</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Nombre completo</th>
                <th># invitados</th>
                <th>Teléfono</th>
                <th>Nota</th>
                <th>Confirmado</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || '<tr><td colspan="5">No hay invitados aún.</td></tr>'}
            </tbody>
          </table>

          <footer style="margin-top: 32px">
            <img src="https://storage.googleapis.com/joseyrosaura/dw-gray-logo.svg" alt="DevWorks Studios" style="width: 100px;height: auto; object-fit: contain;" />
            <p style="font-size: 8px; margin-top: 8px;">Boda Rosaura & José 2026 | Documento por DevWorks Studios | Generado automáticamente para uso interno.</p>
          </footer>
        </div>
      </body>
    </html>
  `
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
