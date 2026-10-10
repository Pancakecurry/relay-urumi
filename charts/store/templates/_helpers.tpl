{{- define "store.env" -}}
- name: WORDPRESS_DB_HOST
  value: {{ printf "%s-db:3306" .Release.Name | quote }}
- name: WORDPRESS_DB_NAME
  value: wordpress
- name: WORDPRESS_DB_USER
  value: wordpress
- name: WORDPRESS_DB_PASSWORD_FILE
  value: /run/store/db-password
{{- range $key := list "AUTH_KEY" "SECURE_AUTH_KEY" "LOGGED_IN_KEY" "NONCE_KEY" "AUTH_SALT" "SECURE_AUTH_SALT" "LOGGED_IN_SALT" "NONCE_SALT" }}
- name: WORDPRESS_{{ $key }}_FILE
  value: /run/store/{{ $key }}
{{- end }}
- name: WORDPRESS_CONFIG_EXTRA
  value: |
    define('WP_HOME', {{ .Values.site.url | squote }});
    define('WP_SITEURL', {{ .Values.site.url | squote }});
    define('DISALLOW_FILE_EDIT', true);
    define('AUTOMATIC_UPDATER_DISABLED', true);
    define('WP_AUTO_UPDATE_CORE', false);
    define('WP_MEMORY_LIMIT', '256M');
    define('WP_MAX_MEMORY_LIMIT', '256M');
{{- end -}}
