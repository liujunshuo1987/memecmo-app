// Where the measurement notes live. Kept apart from the text so that the
// dashboard and the digest can link to the page without carrying its content.
export type NotesLang = 'vi' | 'zh' | 'en';
export const NOTES_PATH: Record<NotesLang, string> = { en: '/notes/measurement', vi: '/notes/measurement/vi', zh: '/notes/measurement/zh' };
export const NOTES_LINK_LABEL: Record<NotesLang, string> = { en: 'Measurement notes', vi: 'Ghi chú đo lường', zh: '测量说明' };
export const NOTES_STANDARD_PDF = '/standard/MemeCMO_AI_Visibility_Measurement_Standard_v1.1.pdf';
