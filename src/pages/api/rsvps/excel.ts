export const prerender = false

import type { APIRoute } from 'astro'
import XLSX from 'xlsx'
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
    console.error('Supabase Excel fetch error:', error)
    return new Response('No se pudo obtener la lista de invitados.', { status: 500 })
  }

  try {
    const buffer = await buildWorkbookBuffer(data ?? [])
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="invitados-boda.xlsx"',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('Excel generation error:', err)
    return new Response('No se pudo generar el Excel.', { status: 500 })
  }
}

async function buildWorkbookBuffer(rows: RSVPRow[]) {
  const wb = XLSX.utils.book_new()
  const summary = summarize(rows)
  const generatedOn = formatDate(new Date())

  const sheetData = [
    ['Lista de Invitados - Boda Rosaura & José'],
    [`Generado: ${generatedOn}`],
    [],
    ['RESUMEN'],
    ['Invitados registrados', summary.total],
    ['Confirmados', summary.confirmed],
    ['Pendientes', summary.pending],
    ['Total invitados declarados', summary.guests],
    [],
    ['Nombre completo', '# de invitados', 'Teléfono', 'Nota', 'Confirmado'],
    ...rows.map((r) => [
      r.full_name || '',
      Number.isFinite(r.guests_count) ? r.guests_count : '',
      r.phone || '',
      r.notes || '',
      r.attending ? 'Sí' : 'No',
    ]),
  ]

  const ws = XLSX.utils.aoa_to_sheet(sheetData)

  // Column widths for readability
  ws['!cols'] = [{ wch: 35 }, { wch: 16 }, { wch: 18 }, { wch: 45 }, { wch: 14 }]

  // Merge title cell
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, // Title row
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }, // Generated date row
  ]

  // Title styling (row 1)
  if (ws['A1']) {
    ws['A1'].s = {
      font: { bold: true, sz: 16, color: { rgb: '00674F' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'E8F4F0' } },
    }
  }

  // Generated date styling (row 2)
  if (ws['A2']) {
    ws['A2'].s = {
      font: { sz: 10, color: { rgb: '5D514B' }, italic: true },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'FDFAF7' } },
    }
  }

  // Summary section header styling (row 4)
  if (ws['A4']) {
    ws['A4'].s = {
      font: { bold: true, sz: 12, color: { rgb: '00674F' } },
      fill: { fgColor: { rgb: 'E8F4F0' } },
      border: {
        bottom: { style: 'medium', color: { rgb: '00674F' } },
      },
    }
  }

  // Summary rows styling (rows 5-8)
  for (let r = 4; r <= 7; r++) {
    const labelCell = XLSX.utils.encode_cell({ r, c: 0 })
    const valueCell = XLSX.utils.encode_cell({ r, c: 1 })

    if (ws[labelCell]) {
      ws[labelCell].s = {
        font: { bold: true, sz: 11, color: { rgb: '1F1A17' } },
        fill: { fgColor: { rgb: 'FFFFFF' } },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: 'E6DCD5' } },
          bottom: { style: 'thin', color: { rgb: 'E6DCD5' } },
          left: { style: 'thin', color: { rgb: 'E6DCD5' } },
          right: { style: 'thin', color: { rgb: 'E6DCD5' } },
        },
      }
    }

    if (ws[valueCell]) {
      ws[valueCell].s = {
        font: { bold: true, sz: 14, color: { rgb: '00674F' } },
        fill: { fgColor: { rgb: 'F0FDF9' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: 'E6DCD5' } },
          bottom: { style: 'thin', color: { rgb: 'E6DCD5' } },
          left: { style: 'thin', color: { rgb: 'E6DCD5' } },
          right: { style: 'thin', color: { rgb: 'E6DCD5' } },
        },
      }
    }
  }

  // Header row styling (row 10)
  const headerRow = 9 // 0-indexed
  for (let c = 0; c <= 4; c++) {
    const cellAddress = XLSX.utils.encode_cell({ r: headerRow, c })
    if (ws[cellAddress]) {
      ws[cellAddress].s = {
        font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '00674F' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'medium', color: { rgb: '00674F' } },
          bottom: { style: 'medium', color: { rgb: '00674F' } },
          left: { style: 'thin', color: { rgb: '006F54' } },
          right: { style: 'thin', color: { rgb: '006F54' } },
        },
      }
    }
  }

  // Data rows styling (alternating colors)
  for (let r = 10; r < 10 + rows.length; r++) {
    const isEven = (r - 10) % 2 === 0
    const bgColor = isEven ? 'FFFFFF' : 'FBF7F2'

    for (let c = 0; c <= 4; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c })
      if (ws[cellAddress]) {
        const baseStyle = {
          fill: { fgColor: { rgb: bgColor } },
          alignment: {
            horizontal: c === 1 ? 'center' : c === 4 ? 'center' : 'left',
            vertical: 'center',
          },
          border: {
            top: { style: 'thin', color: { rgb: 'E6DCD5' } },
            bottom: { style: 'thin', color: { rgb: 'E6DCD5' } },
            left: { style: 'thin', color: { rgb: 'E6DCD5' } },
            right: { style: 'thin', color: { rgb: 'E6DCD5' } },
          },
        }

        // Special styling for "Confirmado" column
        if (c === 4) {
          const attending = ws[cellAddress].v === 'Sí'
          ws[cellAddress].s = {
            ...baseStyle,
            font: {
              bold: true,
              color: { rgb: attending ? '0F7B5C' : 'B3532F' },
            },
          }
        } else {
          ws[cellAddress].s = {
            ...baseStyle,
            font: { color: { rgb: '1F1A17' } },
          }
        }
      }
    }
  }

  // Set row heights
  ws['!rows'] = [
    { hpt: 28 }, // Title
    { hpt: 18 }, // Generated date
    { hpt: 8 }, // Empty row
    { hpt: 22 }, // Summary header
    { hpt: 20 }, // Summary rows
    { hpt: 20 },
    { hpt: 20 },
    { hpt: 20 },
    { hpt: 8 }, // Empty row
    { hpt: 24 }, // Data header
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Invitados')

  // Write workbook to a buffer for HTTP response
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return buffer
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
