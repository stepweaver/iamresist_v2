import { permanentRedirect } from 'next/navigation';

/** Legacy Intel landing now forwards to the default Telescreen surface. */
export default function IntelLiveRedirectPage() {
  permanentRedirect('/telescreen');
}
