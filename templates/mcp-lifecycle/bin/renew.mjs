import { renew } from '../lib/lease.mjs';
// Bounded event-driven renewal: no ambient timer or unsupervised subprocess.
await renew();
