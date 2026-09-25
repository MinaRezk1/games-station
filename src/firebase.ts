import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { ADMIN_EMAILS, firebaseConfig } from './config';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase());
}
