import { json } from '../_lib/auth.js';

export async function onRequestGet({ data }) {
  return json({ email: data.user.email, dev: !!data.user.dev, logoutUrl: '/cdn-cgi/access/logout' });
}
