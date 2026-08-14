{{- define "name" -}}
{{- default $.Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "app.name" -}}
chat-ui
{{- end -}}

{{- define "labels.standard" -}}
release: {{ $.Release.Name | quote }}
heritage: {{ $.Release.Service | quote }}
chart: "{{ include "name" . }}"
app: "{{ include "app.name" . }}"
{{- end -}}

{{- define "labels.resolver" -}}
release: {{ $.Release.Name | quote }}
heritage: {{ $.Release.Service | quote }}
chart: "{{ include "name" . }}"
app: "{{ include "app.name" . }}-resolver"
{{- end -}}

