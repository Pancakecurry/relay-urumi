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
COPY private-rest.php /usr/src/wordpress/wp-content/mu-plugins/relay-private-rest.php
COPY private-rest.php /opt/relay/private-rest.php
COPY prepare.php /opt/relay/prepare.php
COPY entrypoint.sh /opt/relay/entrypoint.sh
COPY relay-apache.conf /etc/apache2/conf-available/relay.conf
RUN php /opt/relay/prepare.php /usr/src/wordpress/wp-includes/class-wpdb.php \
 && printf 'Listen 8080\n' > /etc/apache2/ports.conf \
 && sed -i 's/<VirtualHost \*:80>/<VirtualHost *:8080>/' /etc/apache2/sites-available/000-default.conf \
 && a2enmod ssl && a2enconf relay \
 && chmod 0555 /opt/relay/entrypoint.sh \
 && chown -R www-data:www-data /var/run/apache2 /var/lock/apache2
ENTRYPOINT ["/opt/relay/entrypoint.sh"]
CMD ["apache2-foreground"]
USER www-data
EXPOSE 8080 8443
