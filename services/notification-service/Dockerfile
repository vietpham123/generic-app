FROM php:8.2-apache
RUN docker-php-ext-install pdo pdo_pgsql
RUN a2enmod rewrite
COPY index.php /var/www/html/
COPY .htaccess /var/www/html/
EXPOSE 8080
RUN sed -i 's/80/8080/g' /etc/apache2/sites-available/000-default.conf /etc/apache2/ports.conf
CMD ["apache2-foreground"]
