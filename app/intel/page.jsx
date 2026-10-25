import { permanentRedirect } from 'next/navigation';

/** Intel hub opens the reporting desk. Telescreen stays the video archive. */
export default function IntelRedirectPage() {
  permanentRedirect('/intel/newswire');
}
