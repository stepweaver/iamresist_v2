import { permanentRedirect } from 'next/navigation';

/** URL preservation: same consolidation as source — Intel lives under `/voices`. */
export default function IntelRedirectPage() {
  permanentRedirect('/voices');
}
