#include "f2c.h"

/* f2c declares these helpers as int, but current libf2c returns void.
 * WASM requires identical call signatures, unlike permissive native linkers. */
extern void s_copy(char *, char *, ftnlen, ftnlen);
extern void s_cat(char *, char **, ftnint *, ftnint *, ftnlen);
int vr_s_copy(char *a, char *b, ftnlen la, ftnlen lb) {
  s_copy(a, b, la, lb);
  return 0;
}
int vr_s_cat(char *out, char **parts, ftnint *lengths, ftnint *count, ftnlen size) {
  s_cat(out, parts, lengths, count, size);
  return 0;
}
