#!/bin/sh
#
# Copyright 2015 the original author or authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      https://www.apache.org/licenses/LICENSE-2.0
#
# Gradle startup script for POSIX systems.
#
# This repository wrapper delegates distribution download and caching to
# GradleWrapperMain in the checked-in wrapper JAR.

set -eu

APP_HOME=$(CDPATH= cd -P "$(dirname "$0")" && pwd)

if [ -n "${JAVA_HOME:-}" ]; then
  JAVA_CMD="${JAVA_HOME%/}/bin/java"
else
  JAVA_CMD=$(command -v java || true)
fi

if [ -z "$JAVA_CMD" ] || [ ! -x "$JAVA_CMD" ]; then
  echo "ERROR: Java was not found. Set JAVA_HOME or add java to PATH." >&2
  exit 1
fi

WRAPPER_JAR="$APP_HOME/gradle/wrapper/gradle-wrapper.jar"
if [ ! -f "$WRAPPER_JAR" ]; then
  echo "ERROR: Gradle wrapper JAR is missing: $WRAPPER_JAR" >&2
  exit 1
fi

# JAVA_OPTS and GRADLE_OPTS intentionally undergo shell word splitting so
# callers can provide multiple JVM flags in the conventional Gradle format.
exec "$JAVA_CMD" ${DEFAULT_JVM_OPTS:--Xmx64m -Xms64m} ${JAVA_OPTS:-} ${GRADLE_OPTS:-} \
  "-Dorg.gradle.appname=gradlew" \
  -classpath "$WRAPPER_JAR" \
  org.gradle.wrapper.GradleWrapperMain "$@"
