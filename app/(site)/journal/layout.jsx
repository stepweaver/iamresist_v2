import { barlowCondensed, sourceSans3 } from '@/app/fonts';
import './journal.css';

export default function JournalLayout({ children }) {
  return (
    <div className={`journal-root ${barlowCondensed.variable} ${sourceSans3.variable}`}>
      {children}
    </div>
  );
}
