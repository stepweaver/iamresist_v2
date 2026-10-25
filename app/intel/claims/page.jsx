import { permanentRedirect } from 'next/navigation';

/** Claims desk is retired. Primary records remain on OSINT. */
export default function IntelClaimsRedirect() {
  permanentRedirect('/intel/osint');
}
