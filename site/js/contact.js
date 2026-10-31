// Contact page: send the savings calculator's estimate (if the visitor used it) with the booking form.
const field = document.getElementById('f-savings');
if (field) {
  try {
    field.value = sessionStorage.getItem('bas-savings') || '';
  } catch {
    // Private browsing: the form goes without the estimate.
  }
}
