#!/usr/bin/env bash
# Builda l'immagine aio per il Raspberry Pi (linux/arm64) dal commit corrente,
# la pusha su ghcr.io e sposta il tag git image/latest su quel commit.
#
#   ./build-pi.sh            build + push + tag
#   ./build-pi.sh --status   mostra solo i commit non ancora buildati
#
# Cosa c'è in main ma non nell'immagine: git log --oneline image/latest..main
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

IMAGE="${IMAGE:-ghcr.io/cizzoo/karakeep}"
PLATFORM="${PLATFORM:-linux/arm64}"
BUILDER="${BUILDER:-pibuilder}"
TAG_REF="image/latest"

git fetch -q origin "refs/tags/${TAG_REF}:refs/tags/${TAG_REF}" 2>/dev/null || true

show_pending() {
  if git rev-parse -q --verify "refs/tags/${TAG_REF}" >/dev/null; then
    echo "Immagine attuale: $(git rev-parse --short "${TAG_REF}")"
    local pending
    pending="$(git log --oneline "${TAG_REF}..HEAD")"
    if [[ -n "$pending" ]]; then
      echo "Commit non ancora buildati:"
      echo "$pending" | sed 's/^/  /'
    else
      echo "Nessun commit da buildare."
    fi
  else
    echo "Tag ${TAG_REF} assente: nessuna build tracciata finora."
  fi
}

if [[ "${1:-}" == "--status" ]]; then
  show_pending
  exit 0
fi

# L'immagine deve corrispondere esattamente a un commit.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Ci sono modifiche non committate: committa prima di buildare." >&2
  exit 1
fi

SHA="$(git rev-parse --short HEAD)"
git fetch -q origin
if ! git branch -r --contains HEAD | grep -q .; then
  echo "Il commit ${SHA} non è ancora su origin: fai push prima di buildare." >&2
  exit 1
fi

show_pending
echo
echo "Build ${IMAGE}:${SHA} (${PLATFORM}, builder ${BUILDER})"

docker buildx build \
  --builder "$BUILDER" \
  --platform "$PLATFORM" \
  -f docker/Dockerfile \
  --target aio \
  --build-arg "SERVER_VERSION=${SHA}" \
  -t "${IMAGE}:latest" \
  -t "${IMAGE}:${SHA}" \
  --push \
  .

git tag -f "$TAG_REF" HEAD >/dev/null
git push -q -f origin "refs/tags/${TAG_REF}"
echo
echo "Pushata ${IMAGE}:${SHA}; ${TAG_REF} -> ${SHA}"
echo "Sul Pi: docker compose pull web && docker compose up -d"
