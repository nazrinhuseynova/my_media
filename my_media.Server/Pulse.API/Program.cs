using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Pulse.Application.Auth.Interfaces;
using Pulse.Application.Files.Interfaces;
using Pulse.Application.Mail;
using Pulse.Application.Notifications.Interfaces;
using Pulse.Domain.Entities;
using Pulse.Infrastructure.Authentication;
using Pulse.Infrastructure.Files;
using Pulse.Infrastructure.Mail;
using Pulse.Infrastructure.Notifications;
using Pulse.Infrastructure.Persistence;
using Pulse.API.Helpers;
using Pulse.API.Hosted;
using Pulse.Infrastructure.Realtime;

var contentRoot = Directory.GetCurrentDirectory();
var nestedSettings = Path.Combine(contentRoot, "Pulse.API", "appsettings.json");
if (File.Exists(nestedSettings))
{
    contentRoot = Path.Combine(contentRoot, "Pulse.API");
}

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = contentRoot
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"));
});

builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<IFileStorageService, CloudinaryFileStorageService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IOtpSender, OtpSender>();
builder.Services.AddSingleton<IUserIdProvider, PulseUserIdProvider>();
builder.Services.AddSignalR();
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 80L * 1024 * 1024;
});
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 80 * 1024 * 1024;
    options.ValueLengthLimit = int.MaxValue;
    options.MemoryBufferThreshold = 80 * 1024 * 1024;
});

builder.Services
    .AddIdentityCore<AppUser>(options =>
    {
        options.Password.RequiredLength = 8;
        options.Password.RequireDigit = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireUppercase = false;
        options.Password.RequireNonAlphanumeric = false;
        options.User.RequireUniqueEmail = true;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
        options.Lockout.AllowedForNewUsers = true;
    })
    .AddRoles<IdentityRole<Guid>>()
    .AddEntityFrameworkStores<AppDbContext>()
    .AddSignInManager()
    .AddDefaultTokenProviders();

var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("JWT Key yoxdur");
JwtSecurityTokenHandler.DefaultInboundClaimTypeMap.Clear();

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            NameClaimType = ClaimTypes.Name,
            RoleClaimType = ClaimTypes.Role
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            },
            OnTokenValidated = async context =>
            {
                var principal = context.Principal;
                if (principal?.FindFirst("purpose")?.Value == "password-reset")
                {
                    context.Fail("Bu token yalnız şifrə üçündür");
                    return;
                }

                var userId = principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                    ?? principal?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
                if (string.IsNullOrWhiteSpace(userId))
                {
                    context.Fail("Token istifadəçi id-si yoxdur");
                    return;
                }

                var users = context.HttpContext.RequestServices.GetRequiredService<UserManager<AppUser>>();
                var user = await users.FindByIdAsync(userId);
                var stamp = principal?.FindFirst("sst")?.Value;
                if (user == null || !user.IsActive || user.IsBanned || string.IsNullOrEmpty(stamp) || stamp != user.SecurityStamp)
                {
                    context.Fail("Hesab aktiv deyil");
                }
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddHostedService<ScheduledPostNotifier>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactClient", policy =>
    {
        policy.WithOrigins(
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3001",
                "http://localhost:53464",
                "https://localhost:53464")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
    var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
    await db.Database.MigrateAsync();
    await DbSeeder.SeedAsync(db, users, roles);
    await PostSlugBackfill.Run(db);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("ReactClient");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<NotificationHub>("/hubs/notifications");
app.MapHub<ChatHub>("/hubs/chat");

app.Run();
