ARG PLATFORM_IMAGE=relay/platform:unbuilt
FROM ${PLATFORM_IMAGE}
USER root
ARG TARGETARCH
RUN case "$TARGETARCH" in arm64) helm_sha=31c5794dd55c66a51e6b7d2e2ac7a114ae8b1de41ff1d9ba51748ac973b06a08;; amd64) helm_sha=86584a54def73570558f66f5111cc53dfed56689637ae32c1201205d494f54fb;; *) exit 1;; esac && wget -q "https://get.helm.sh/helm-v4.3.0-linux-$TARGETARCH.tar.gz" -O /tmp/helm.tar.gz && echo "$helm_sha  /tmp/helm.tar.gz" | sha256sum -c - && tar -xzf /tmp/helm.tar.gz -C /tmp && mv /tmp/linux-$TARGETARCH/helm /usr/local/bin/helm && rm -rf /tmp/helm.tar.gz /tmp/linux-$TARGETARCH
COPY --chown=node:node charts /app/charts
USER node
CMD ["node", "dist/apps/provisioner/src/server.js"]
