# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
FROM wordpress:cli-2.12.0-php8.3@sha256:36243da432a0f0a3b56dc3240ecee9b159108d71305e7c064d987a20a465bfde AS cli
FROM wordpress:7.1.3-php8.3-apache@sha256:8ecd8d8e374167ea22235acf30f80d1165b82f07ffa5bcef90c1cad8f7be251f
COPY --from=cli /usr/local/bin/wp /usr/local/bin/wp
ADD --checksum=sha256:5317434cb381b5fdc7c1dd6ee258324f08c390976aaf8d1199f2a0e9a3ab8586 https://downloads.wordpress.org/plugin/woocommerce.11.2.1.zip /tmp/woocommerce.zip
RUN php -r '$z=new ZipArchive; if($z->open("/tmp/woocommerce.zip")!==true) exit(1); $z->extractTo("/usr/src/wordpress/wp-content/plugins"); $z->close();' && rm /tmp/woocommerce.zip && chown -R www-data:www-data /usr/src/wordpress/wp-content/plugins/woocommerce
COPY install.php /opt/relay/install.php
COPY bootstrap.sh /opt/relay/bootstrap.sh
COPY bootstrap.php /opt/relay/bootstrap.php
COPY health.php /usr/src/wordpress/relay-health.php
RUN echo 'ServerName localhost' > /etc/apache2/conf-available/relay.conf && a2enconf relay
