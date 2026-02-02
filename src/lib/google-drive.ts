import { google } from "googleapis"

const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
]

/**
 * Get authenticated Google Drive client using service account
 */
function getDriveClient() {
    const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    if (!credentials) {
        throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY environment variable not set")
    }

    const serviceAccount = JSON.parse(credentials)

    const auth = new google.auth.GoogleAuth({
        credentials: serviceAccount,
        scopes: ["https://www.googleapis.com/auth/drive.file"]
    })

    return google.drive({ version: "v3", auth })
}

/**
 * Get or create folder structure: Stundennachweise / {year} / {month}
 */
async function getOrCreateMonthFolder(year: number, month: number): Promise<string> {
    const drive = getDriveClient()
    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID

    if (!rootFolderId) {
        throw new Error("GOOGLE_DRIVE_FOLDER_ID environment variable not set")
    }

    // Find or create year folder
    const yearFolderName = `${year}`
    let yearFolderId = await findFolder(drive, rootFolderId, yearFolderName)

    if (!yearFolderId) {
        yearFolderId = await createFolder(drive, rootFolderId, yearFolderName)
    }

    // Find or create month folder
    const monthFolderName = `${String(month).padStart(2, "0")}-${MONTH_NAMES[month - 1]}`
    let monthFolderId = await findFolder(drive, yearFolderId, monthFolderName)

    if (!monthFolderId) {
        monthFolderId = await createFolder(drive, yearFolderId, monthFolderName)
    }

    return monthFolderId
}

/**
 * Find a folder by name within a parent folder
 */
async function findFolder(
    drive: ReturnType<typeof google.drive>,
    parentId: string,
    name: string
): Promise<string | null> {
    const res = await drive.files.list({
        q: `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: "files(id, name)",
        spaces: "drive"
    })

    const files = res.data.files
    return files && files.length > 0 ? files[0].id! : null
}

/**
 * Create a folder within a parent folder
 */
async function createFolder(
    drive: ReturnType<typeof google.drive>,
    parentId: string,
    name: string
): Promise<string> {
    const res = await drive.files.create({
        requestBody: {
            name,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentId]
        },
        fields: "id"
    })

    return res.data.id!
}

interface UploadTimesheetPdfParams {
    pdfBuffer: Buffer
    clientName: string
    employeeName: string
    month: number
    year: number
}

interface UploadResult {
    fileId: string
    webViewLink: string
}

/**
 * Upload timesheet PDF to Google Drive
 * Returns the file ID and web view link
 */
export async function uploadTimesheetPdf(params: UploadTimesheetPdfParams): Promise<UploadResult> {
    const { pdfBuffer, clientName, employeeName, month, year } = params

    const drive = getDriveClient()
    const monthFolderId = await getOrCreateMonthFolder(year, month)

    // Clean names for filename
    const cleanClientName = clientName.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, "").replace(/\s+/g, "_")
    const cleanEmployeeName = employeeName.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, "").replace(/\s+/g, "_")
    const monthName = MONTH_NAMES[month - 1]

    const fileName = `${cleanClientName}_${cleanEmployeeName}_${monthName}_${year}.pdf`

    // Check if file already exists (update instead of create)
    const existingFile = await drive.files.list({
        q: `'${monthFolderId}' in parents and name='${fileName}' and trashed=false`,
        fields: "files(id)",
        spaces: "drive"
    })

    let fileId: string

    if (existingFile.data.files && existingFile.data.files.length > 0) {
        // Update existing file
        fileId = existingFile.data.files[0].id!

        await drive.files.update({
            fileId,
            media: {
                mimeType: "application/pdf",
                body: bufferToStream(pdfBuffer)
            }
        })
    } else {
        // Create new file
        const res = await drive.files.create({
            requestBody: {
                name: fileName,
                mimeType: "application/pdf",
                parents: [monthFolderId]
            },
            media: {
                mimeType: "application/pdf",
                body: bufferToStream(pdfBuffer)
            },
            fields: "id, webViewLink"
        })

        fileId = res.data.id!
    }

    // Get web view link
    const fileInfo = await drive.files.get({
        fileId,
        fields: "webViewLink"
    })

    return {
        fileId,
        webViewLink: fileInfo.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`
    }
}

/**
 * Convert Buffer to readable stream for Google API
 */
function bufferToStream(buffer: Buffer) {
    const { Readable } = require("stream")
    const stream = new Readable()
    stream.push(buffer)
    stream.push(null)
    return stream
}

/**
 * Get download URL for a file
 */
export async function getDownloadUrl(fileId: string): Promise<string> {
    return `https://drive.google.com/uc?export=download&id=${fileId}`
}

// ============================================================================
// Client Folder Upload Functions (for "Nachweise und Rechnungen" structure)
// ============================================================================

/**
 * Find existing client folder "Team - {Name}" in the Nachweise root folder
 * @param clientName - The client name (e.g., "Jana Scheuer")
 * @returns The folder ID if found, null otherwise
 */
async function findClientFolder(clientName: string): Promise<string | null> {
    const drive = getDriveClient()
    const rootFolderId = process.env.GOOGLE_DRIVE_NACHWEISE_FOLDER_ID

    if (!rootFolderId) {
        throw new Error("GOOGLE_DRIVE_NACHWEISE_FOLDER_ID environment variable not set")
    }

    // Clean the client name and build the expected folder name
    const cleanName = clientName.trim()
    const folderName = `Team - ${cleanName}`

    return findFolder(drive, rootFolderId, folderName)
}

/**
 * Get or create year/month subfolder structure within a client folder
 * Creates: {clientFolderId}/{year}/{month-name}
 * @param clientFolderId - The parent client folder ID
 * @param year - Year (e.g., 2026)
 * @param month - Month number (1-12)
 * @returns The month folder ID
 */
async function getOrCreateYearMonthFolder(
    clientFolderId: string,
    year: number,
    month: number
): Promise<string> {
    const drive = getDriveClient()

    // Find or create year folder
    const yearFolderName = `${year}`
    let yearFolderId = await findFolder(drive, clientFolderId, yearFolderName)

    if (!yearFolderId) {
        yearFolderId = await createFolder(drive, clientFolderId, yearFolderName)
    }

    // Find or create month folder (format: "01-Januar")
    const monthFolderName = `${String(month).padStart(2, "0")}-${MONTH_NAMES[month - 1]}`
    let monthFolderId = await findFolder(drive, yearFolderId, monthFolderName)

    if (!monthFolderId) {
        monthFolderId = await createFolder(drive, yearFolderId, monthFolderName)
    }

    return monthFolderId
}

interface UploadToClientFolderParams {
    pdfBuffer: Buffer
    clientName: string  // e.g., "Jana Scheuer"
    month: number
    year: number
    fileName?: string   // Optional custom filename
}

/**
 * Upload timesheet PDF to client's folder structure in Google Drive
 * Structure: Team - {ClientName}/{year}/{month}/Stundennachweis_{Month}_{Year}.pdf
 *
 * SECURITY: Does NOT delete/overwrite existing files - adds timestamp for duplicates
 *
 * @returns The file ID and web view link
 */
export async function uploadToClientFolder(params: UploadToClientFolderParams): Promise<UploadResult> {
    const { pdfBuffer, clientName, month, year, fileName: customFileName } = params

    const drive = getDriveClient()

    // Step 1: Find existing client folder
    const clientFolderId = await findClientFolder(clientName)

    if (!clientFolderId) {
        throw new Error(`Client folder "Team - ${clientName}" not found in Google Drive. Please create it first.`)
    }

    // Step 2: Get or create year/month subfolder
    const monthFolderId = await getOrCreateYearMonthFolder(clientFolderId, year, month)

    // Step 3: Generate filename
    const monthName = MONTH_NAMES[month - 1]
    const baseFileName = customFileName || `Stundennachweis_${monthName}_${year}`

    // Step 4: Check for existing file with same name (add timestamp if exists)
    let finalFileName = `${baseFileName}.pdf`

    const existingFile = await drive.files.list({
        q: `'${monthFolderId}' in parents and name='${finalFileName}' and trashed=false`,
        fields: "files(id)",
        spaces: "drive"
    })

    if (existingFile.data.files && existingFile.data.files.length > 0) {
        // File exists - add timestamp to avoid overwriting
        const timestamp = Date.now()
        finalFileName = `${baseFileName}_${timestamp}.pdf`
    }

    // Step 5: Upload new file (NEVER overwrite/delete existing)
    const res = await drive.files.create({
        requestBody: {
            name: finalFileName,
            mimeType: "application/pdf",
            parents: [monthFolderId]
        },
        media: {
            mimeType: "application/pdf",
            body: bufferToStream(pdfBuffer)
        },
        fields: "id, webViewLink"
    })

    const fileId = res.data.id!

    // Get web view link
    const fileInfo = await drive.files.get({
        fileId,
        fields: "webViewLink"
    })

    return {
        fileId,
        webViewLink: fileInfo.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`
    }
}
