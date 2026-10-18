package com.learning.jwtauth.config;

import java.time.Clock;
import java.util.EnumSet;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import com.learning.jwtauth.user.Role;
import com.learning.jwtauth.user.User;
import com.learning.jwtauth.user.UserRepository;

/** Creates the bootstrap admin from app.admin.* (ADMIN_EMAIL / ADMIN_PASSWORD) if it does not exist yet. */
@Component
public class AdminSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminSeeder.class);

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final AppProperties props;
    private final Clock clock;

    public AdminSeeder(UserRepository users, PasswordEncoder passwordEncoder, AppProperties props, Clock clock) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.props = props;
        this.clock = clock;
    }

    @Override
    public void run(ApplicationArguments args) {
        String email = props.admin().email().strip().toLowerCase(Locale.ROOT);
        if (users.existsByEmail(email)) {
            return;
        }
        users.save(new User(email, "Administrator", passwordEncoder.encode(props.admin().password()),
                EnumSet.of(Role.USER, Role.ADMIN), clock.instant()));
        log.info("Seeded admin account {}", email);
    }
}
