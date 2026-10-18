# syntax=docker/dockerfile:1

# ---- build: compile and package the Spring Boot jar ----
FROM eclipse-temurin:25-jdk AS build
WORKDIR /app

# Copy the wrapper and POM first so dependency resolution is cached until the POM changes.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -B -ntp dependency:go-offline

COPY src/ src/
RUN ./mvnw -B -ntp clean package -DskipTests \
    && cp target/spring-jwt-security-*.jar app.jar

# ---- run: just a JRE and the jar, as a non-root user ----
FROM eclipse-temurin:25-jre AS runtime
WORKDIR /app
RUN groupadd --system app && useradd --system --gid app --home /app app
COPY --from=build /app/app.jar app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
