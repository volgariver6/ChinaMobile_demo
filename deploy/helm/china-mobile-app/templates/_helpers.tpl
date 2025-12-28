{{/*
Expand the name of the chart.
*/}}
{{- define "china-mobile-demo.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "china-mobile-demo.fullname" -}}
{{- if .Values.nameOverride }}
{{- .Values.nameOverride | trunc 63 | trimSuffix "-" }}
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
{{- define "china-mobile-demo.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "china-mobile-demo.labels" -}}
helm.sh/chart: {{ include "china-mobile-demo.chart" . }}
{{ include "china-mobile-demo.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "china-mobile-demo.selectorLabels" -}}
app.kubernetes.io/name: {{ include "china-mobile-demo.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Backend labels
*/}}
{{- define "china-mobile-demo.backend.labels" -}}
{{ include "china-mobile-demo.labels" . }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Backend selector labels
*/}}
{{- define "china-mobile-demo.backend.selectorLabels" -}}
{{ include "china-mobile-demo.selectorLabels" . }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Frontend labels
*/}}
{{- define "china-mobile-demo.frontend.labels" -}}
{{ include "china-mobile-demo.labels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Frontend selector labels
*/}}
{{- define "china-mobile-demo.frontend.selectorLabels" -}}
{{ include "china-mobile-demo.selectorLabels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Backend image
*/}}
{{- define "china-mobile-demo.backend.image" -}}
{{- if .Values.global.imageRegistry }}
{{- printf "%s/%s:%s" .Values.global.imageRegistry .Values.backend.image.repository .Values.backend.image.tag }}
{{- else }}
{{- printf "%s:%s" .Values.backend.image.repository .Values.backend.image.tag }}
{{- end }}
{{- end }}

{{/*
Frontend image
*/}}
{{- define "china-mobile-demo.frontend.image" -}}
{{- if .Values.global.imageRegistry }}
{{- printf "%s/%s:%s" .Values.global.imageRegistry .Values.frontend.image.repository .Values.frontend.image.tag }}
{{- else }}
{{- printf "%s:%s" .Values.frontend.image.repository .Values.frontend.image.tag }}
{{- end }}
{{- end }}

