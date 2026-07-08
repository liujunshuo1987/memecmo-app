// app.memecmo.ai is the product domain — the marketing homepage lives on
// https://memecmo.ai (separate deployment). The legacy marketing page that
// used to render here confused the two brands, so the app root now routes
// straight into the product: /dashboard (which itself redirects to /login
// when unauthenticated).

import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard');
}
