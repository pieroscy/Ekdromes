# Εκδρομές

Εφαρμογή (PWA) για events, πληρωμές συμμετεχόντων και έξοδα.

- **Εφαρμογή:** https://pieroscy.github.io/ekdromes/
- **Φιλοξενία:** GitHub Pages (δωρεάν)
- **Δεδομένα & login:** Firebase project `ekdromes-d9c0c`, δωρεάν πλάνο Spark (μην κάνεις ποτέ upgrade σε Blaze)

## Πρόσβαση σε άλλο άτομο
Πρόσθεσε το email του στο `firebase-config.js` (`ALLOWED_EMAILS`) και στους κανόνες στο Firebase Console → Firestore → Rules (αντίγραφό τους στο `firestore.rules`).

## Ενημέρωση
Μετά από αλλαγές, άλλαξε το `VERSION` στο `sw.js` ώστε τα κινητά να πάρουν τη νέα έκδοση.
