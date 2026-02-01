/**
 * Export Templates Index
 *
 * Centralizes all available export templates for easy access.
 *
 * Available Templates:
 * - standard: Full detail export (default)
 * - datev: DATEV-compatible format for German accounting software
 * - simple: Minimal export (Date, Employee, Hours)
 * - custom: All fields for custom processing
 */

export * from "./base-template"
export { standardTemplate } from "./standard-template"
export { datevTemplate } from "./datev-template"
export { simpleTemplate } from "./simple-template"
export { customTemplate } from "./custom-template"

import { ExportTemplate } from "./base-template"
import { standardTemplate } from "./standard-template"
import { datevTemplate } from "./datev-template"
import { simpleTemplate } from "./simple-template"
import { customTemplate } from "./custom-template"

/**
 * All available export templates
 */
export const exportTemplates: ExportTemplate[] = [
    standardTemplate,
    datevTemplate,
    simpleTemplate,
    customTemplate
]

/**
 * Template metadata for UI display
 */
export const templateOptions = [
    { id: "standard", name: "Standard", description: "Alle Details" },
    { id: "datev", name: "DATEV", description: "DATEV-kompatibel" },
    { id: "simple", name: "Einfach", description: "Nur Stunden-Summen" }
] as const

export type TemplateId = typeof templateOptions[number]["id"]

/**
 * Get template by ID
 */
export function getTemplateById(id: string): ExportTemplate | null {
    return exportTemplates.find(t => t.id === id) || null
}

/**
 * Get template by ID or return default (standard)
 */
export function getTemplateByIdOrDefault(id?: string): ExportTemplate {
    if (!id) return standardTemplate
    return getTemplateById(id) || standardTemplate
}
