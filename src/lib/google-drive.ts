import { google } from "googleapis"
import { Readable } from "stream"

/**
 * Google Drive Service
 *
 * Note: Uses the same GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY as Google Sheets
 * Requires GOOGLE_DRIVE_FOLDER_ID for the target upload folder
 */
export async function getGoogleDriveClient() {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        throw new Error("Google credentials not configured. Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY")
    }

    const auth = new google.auth.JWT({
        email: process.env.GOOGLE_CLIENT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        scopes: [
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/spreadsheets" // Keep existing scope
        ],
    })

    return google.drive({ version: "v3", auth })
}

interface UploadPdfParams {
    fileName: string
    pdfBuffer: ArrayBuffer
    folderId?: string
}

interface UploadResult {
    fileId: string
    webViewLink: string
    webContentLink: string
}

/**
 * Upload a PDF file to Google Drive
 * Returns the file ID and shareable links
 */
export async function uploadPdfToDrive(params: UploadPdfParams): Promise<UploadResult> {
    const { fileName, pdfBuffer, folderId } = params
    const drive = await getGoogleDriveClient()

    // Use configured folder or default
    const targetFolderId = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID

    if (!targetFolderId) {
        throw new Error("GOOGLE_DRIVE_FOLDER_ID not configured")
    }

    // Convert ArrayBuffer to Buffer and create readable stream
    const buffer = Buffer.from(pdfBuffer)
    const stream = new Readable()
    stream.push(buffer)
    stream.push(null)

    // Create file metadata
    const fileMetadata = {
        name: fileName,
        parents: [targetFolderId],
    }

    // Upload file
    const response = await drive.files.create({
        requestBody: fileMetadata,
        media: {
            mimeType: "application/pdf",
            body: stream,
        },
        fields: "id, webViewLink, webContentLink",
    })

    if (!response.data.id) {
        throw new Error("Failed to upload file to Google Drive")
    }

    // Make the file accessible to anyone with the link
    await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
            role: "reader",
            type: "anyone",
        },
    })

    return {
        fileId: response.data.id,
        webViewLink: response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`,
        webContentLink: response.data.webContentLink || `https://drive.google.com/uc?id=${response.data.id}&export=download`,
    }
}

/**
 * Update an existing PDF in Google Drive
 * (e.g., when adding the second signature)
 */
export async function updatePdfInDrive(fileId: string, pdfBuffer: ArrayBuffer): Promise<void> {
    const drive = await getGoogleDriveClient()

    const buffer = Buffer.from(pdfBuffer)
    const stream = new Readable()
    stream.push(buffer)
    stream.push(null)

    await drive.files.update({
        fileId,
        media: {
            mimeType: "application/pdf",
            body: stream,
        },
    })
}

/**
 * Delete a file from Google Drive
 */
export async function deleteFileFromDrive(fileId: string): Promise<void> {
    const drive = await getGoogleDriveClient()

    await drive.files.delete({
        fileId,
    })
}

/**
 * Get file info from Google Drive
 */
export async function getFileInfo(fileId: string) {
    const drive = await getGoogleDriveClient()

    const response = await drive.files.get({
        fileId,
        fields: "id, name, webViewLink, webContentLink, createdTime, modifiedTime",
    })

    return response.data
}
