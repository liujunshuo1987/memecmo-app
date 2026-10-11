import NotesPage, { notesMetadata } from './notes-page';
export const metadata = notesMetadata('en');
export default function Page() { return <NotesPage lang="en" />; }
