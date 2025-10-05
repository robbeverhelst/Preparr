{{/*
Expand the name of the chart.
*/}}
{{- define "preparr.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "preparr.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "preparr.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "preparr.labels" -}}
helm.sh/chart: {{ include "preparr.chart" . }}
{{ include "preparr.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "preparr.selectorLabels" -}}
app.kubernetes.io/name: {{ include "preparr.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
PostgreSQL host
*/}}
{{- define "preparr.postgresHost" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "postgres" }}
{{- else }}
{{- .Values.postgresql.externalHost }}
{{- end }}
{{- end }}

{{/*
PrepArr image
*/}}
{{- define "preparr.image" -}}
{{- printf "%s:%s" .Values.preparr.image.repository (.Values.preparr.image.tag | default .Chart.AppVersion) }}
{{- end }}

{{/*
Image pull secrets - merge global and local
*/}}
{{- define "preparr.imagePullSecrets" -}}
{{- $secrets := list }}
{{- if .Values.global.imagePullSecrets }}
{{- $secrets = concat $secrets .Values.global.imagePullSecrets }}
{{- end }}
{{- if .local.image.pullSecrets }}
{{- $secrets = concat $secrets .local.image.pullSecrets }}
{{- end }}
{{- if $secrets }}
imagePullSecrets:
{{- range $secrets }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Pod annotations - merge global and local
*/}}
{{- define "preparr.podAnnotations" -}}
{{- $annotations := merge (default dict .local.podAnnotations) (default dict .Values.global.annotations) }}
{{- with $annotations }}
{{- toYaml . }}
{{- end }}
{{- end }}

{{/*
Pod labels - merge global, common, and local labels
*/}}
{{- define "preparr.podLabels" -}}
{{- $labels := merge (default dict .local.podLabels) (default dict .Values.global.labels) }}
{{- with $labels }}
{{- toYaml . }}
{{- end }}
{{- end }}

{{/*
Service annotations - merge global and local
*/}}
{{- define "preparr.serviceAnnotations" -}}
{{- $annotations := merge (default dict .local.service.annotations) (default dict .Values.global.annotations) }}
{{- with $annotations }}
{{- toYaml . }}
{{- end }}
{{- end }}

{{/*
Service labels - merge global and local
*/}}
{{- define "preparr.serviceLabels" -}}
{{- $labels := merge (default dict .local.service.labels) (default dict .Values.global.labels) }}
{{- with $labels }}
{{- toYaml . }}
{{- end }}
{{- end }}

{{/*
Service account name
*/}}
{{- define "preparr.serviceAccountName" -}}
{{- if .local.serviceAccount.create }}
{{- default .componentName .local.serviceAccount.name }}
{{- else }}
{{- default "default" .local.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
PostgreSQL password secret name
*/}}
{{- define "preparr.postgresql.secretName" -}}
{{- if .Values.postgresql.auth.existingSecret }}
{{- .Values.postgresql.auth.existingSecret }}
{{- else }}
{{- printf "%s-postgresql" (include "preparr.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Get PostgreSQL password from secret
*/}}
{{- define "preparr.postgresql.password" -}}
{{- if .Values.postgresql.auth.existingSecret }}
{{- printf "valueFrom:\n  secretKeyRef:\n    name: %s\n    key: %s" (include "preparr.postgresql.secretName" .) (.Values.postgresql.auth.secretKeys.adminPasswordKey | default "password") | nindent 2 }}
{{- else }}
{{- .Values.postgresql.auth.password }}
{{- end }}
{{- end }}

{{/*
Component-specific secret name
*/}}
{{- define "preparr.componentSecretName" -}}
{{- if .local.auth.existingSecret }}
{{- .local.auth.existingSecret }}
{{- else }}
{{- printf "%s-%s" (include "preparr.fullname" .root) .componentName }}
{{- end }}
{{- end }}
