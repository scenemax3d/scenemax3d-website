const std = @import("std");

const c = @cImport({
    @cInclude("arpa/inet.h");
    @cInclude("dirent.h");
    @cInclude("errno.h");
    @cInclude("fcntl.h");
    @cInclude("netinet/in.h");
    @cInclude("stdio.h");
    @cInclude("stdlib.h");
    @cInclude("string.h");
    @cInclude("sys/socket.h");
    @cInclude("sys/stat.h");
    @cInclude("sys/types.h");
    @cInclude("unistd.h");
});

const Allocator = std.mem.Allocator;
const JsonValue = std.json.Value;

const max_header_bytes = 64 * 1024;
const max_body_bytes = 30 * 1024 * 1024;
const read_chunk_size = 16 * 1024;

const content_root = "src/content";
const public_root = "public";
const dist_root = "dist";
const tutorials_path = content_root ++ "/tutorials.json";
const categories_path = content_root ++ "/tutorialCategories.json";
const subcategories_path = content_root ++ "/tutorialSubcategories.json";
const samples_path = content_root ++ "/tutorialSamples.json";
const site_base_path = content_root ++ "/siteBase.json";
const scripts_root = content_root ++ "/tutorialScripts";
const tutorial_assets_root = public_root ++ "/assets/tutorials";

const Request = struct {
    method: []const u8,
    target: []const u8,
    path: []const u8,
    headers: []const u8,
    body: []const u8,

    fn header(self: Request, name: []const u8) ?[]const u8 {
        var lines = std.mem.splitSequence(u8, self.headers, "\r\n");
        while (lines.next()) |line| {
            if (line.len == 0) continue;
            const colon = std.mem.indexOfScalar(u8, line, ':') orelse continue;
            const key = std.mem.trim(u8, line[0..colon], " \t");
            const value = std.mem.trim(u8, line[colon + 1 ..], " \t");
            if (std.ascii.eqlIgnoreCase(key, name)) return value;
        }
        return null;
    }
};

pub fn main() !void {
    const allocator = std.heap.page_allocator;
    const port = getEnvInt("PORT", 8080);
    const admin_user = getEnv("ADMIN_USERNAME");
    const admin_password = getEnv("ADMIN_PASSWORD");
    const auth_header = if (admin_user.len > 0 and admin_password.len > 0)
        try makeBasicAuthHeader(allocator, admin_user, admin_password)
    else
        "";
    defer if (auth_header.len > 0) allocator.free(auth_header);

    const server_fd = c.socket(c.AF_INET, c.SOCK_STREAM, 0);
    if (server_fd < 0) return error.SocketFailed;
    defer _ = c.close(server_fd);

    var yes: c_int = 1;
    _ = c.setsockopt(server_fd, c.SOL_SOCKET, c.SO_REUSEADDR, &yes, @sizeOf(c_int));

    var addr: c.sockaddr_in = std.mem.zeroes(c.sockaddr_in);
    addr.sin_family = c.AF_INET;
    addr.sin_port = c.htons(@intCast(port));
    addr.sin_addr.s_addr = c.htonl(c.INADDR_ANY);

    if (c.bind(server_fd, @ptrCast(&addr), @sizeOf(c.sockaddr_in)) != 0) return error.BindFailed;
    if (c.listen(server_fd, 128) != 0) return error.ListenFailed;

    std.debug.print("SceneMax Zig server listening on http://0.0.0.0:{d}\n", .{port});
    if (auth_header.len == 0) {
        std.debug.print("ADMIN_USERNAME and ADMIN_PASSWORD are not set; admin routes are unprotected.\n", .{});
    }

    while (true) {
        const client_fd = c.accept(server_fd, null, null);
        if (client_fd < 0) continue;
        handleConnection(allocator, client_fd, auth_header) catch |err| {
            std.debug.print("request failed: {t}\n", .{err});
        };
        _ = c.close(client_fd);
    }
}

fn handleConnection(allocator: Allocator, fd: c_int, auth_header: []const u8) !void {
    const request_bytes = try readHttpRequest(allocator, fd);
    defer allocator.free(request_bytes);

    const request = parseRequest(request_bytes) catch {
        try sendJsonError(fd, 400, "Bad request");
        return;
    };

    if (std.mem.eql(u8, request.path, "/healthz")) {
        try sendBytes(fd, 200, "OK", "application/json; charset=utf-8", "no-store", "{\"ok\":true}", null);
        return;
    }

    if (std.mem.startsWith(u8, request.path, "/api/content/")) {
        try handleContentApi(allocator, fd, request);
        return;
    }

    if (std.mem.startsWith(u8, request.path, "/api/admin/")) {
        if (!try authorize(fd, request, auth_header)) return;
        try handleAdminApi(allocator, fd, request);
        return;
    }

    if (std.mem.startsWith(u8, request.path, "/admin/")) {
        if (!try authorize(fd, request, auth_header)) return;
    }

    if (!std.mem.eql(u8, request.method, "GET") and !std.mem.eql(u8, request.method, "HEAD")) {
        try sendJsonError(fd, 405, "Method not allowed");
        return;
    }

    try handleStatic(allocator, fd, request);
}

fn readHttpRequest(allocator: Allocator, fd: c_int) ![]u8 {
    var buffer: std.ArrayList(u8) = .empty;
    defer buffer.deinit(allocator);

    var header_end: ?usize = null;
    var content_length: usize = 0;
    var temp: [read_chunk_size]u8 = undefined;

    while (true) {
        const n = c.recv(fd, &temp, temp.len, 0);
        if (n <= 0) break;
        try buffer.appendSlice(allocator, temp[0..@intCast(n)]);

        if (header_end == null) {
            if (std.mem.indexOf(u8, buffer.items, "\r\n\r\n")) |pos| {
                header_end = pos + 4;
                content_length = parseContentLength(buffer.items[0..pos]) orelse 0;
                if (content_length > max_body_bytes) return error.BodyTooLarge;
            } else if (buffer.items.len > max_header_bytes) {
                return error.HeaderTooLarge;
            }
        }

        if (header_end) |end| {
            if (buffer.items.len >= end + content_length) break;
        }
    }

    return buffer.toOwnedSlice(allocator);
}

fn parseRequest(bytes: []u8) !Request {
    const header_pos = std.mem.indexOf(u8, bytes, "\r\n\r\n") orelse return error.BadRequest;
    const head = bytes[0..header_pos];
    const body = bytes[header_pos + 4 ..];
    const line_end = std.mem.indexOf(u8, head, "\r\n") orelse return error.BadRequest;
    const request_line = head[0..line_end];
    var parts = std.mem.splitScalar(u8, request_line, ' ');
    const method = parts.next() orelse return error.BadRequest;
    const target = parts.next() orelse return error.BadRequest;
    const path_end = std.mem.indexOfAny(u8, target, "?#") orelse target.len;
    const path = target[0..path_end];

    return .{
        .method = method,
        .target = target,
        .path = path,
        .headers = if (line_end + 2 <= head.len) head[line_end + 2 ..] else "",
        .body = body,
    };
}

fn parseContentLength(headers: []const u8) ?usize {
    var lines = std.mem.splitSequence(u8, headers, "\r\n");
    _ = lines.next();
    while (lines.next()) |line| {
        const colon = std.mem.indexOfScalar(u8, line, ':') orelse continue;
        const key = std.mem.trim(u8, line[0..colon], " \t");
        if (!std.ascii.eqlIgnoreCase(key, "content-length")) continue;
        return std.fmt.parseUnsigned(usize, std.mem.trim(u8, line[colon + 1 ..], " \t"), 10) catch null;
    }
    return null;
}

fn handleContentApi(allocator: Allocator, fd: c_int, request: Request) !void {
    if (!std.mem.eql(u8, request.method, "GET")) {
        try sendJsonError(fd, 405, "Method not allowed");
        return;
    }

    if (std.mem.eql(u8, request.path, "/api/content/tutorials")) {
        const body = try buildTutorialContentIndex(allocator, false);
        defer allocator.free(body);
        try sendBytes(fd, 200, "OK", "application/json; charset=utf-8", "no-store", body, null);
        return;
    }

    const prefix = "/api/content/tutorials/";
    if (std.mem.startsWith(u8, request.path, prefix)) {
        const slug = try sanitizePathPart(allocator, request.path[prefix.len..]);
        defer allocator.free(slug);
        const body = buildTutorialContentDetail(allocator, slug) catch {
            try sendJsonError(fd, 404, "Tutorial not found");
            return;
        };
        defer allocator.free(body);
        try sendBytes(fd, 200, "OK", "application/json; charset=utf-8", "no-store", body, null);
        return;
    }

    try sendJsonError(fd, 404, "Content API route not found");
}

fn handleAdminApi(allocator: Allocator, fd: c_int, request: Request) !void {
    if (std.mem.eql(u8, request.method, "GET") and std.mem.eql(u8, request.path, "/api/admin/tutorials")) {
        const body = try buildAdminTutorialIndex(allocator);
        defer allocator.free(body);
        try sendBytes(fd, 200, "OK", "application/json; charset=utf-8", "no-store", body, null);
        return;
    }

    if (std.mem.eql(u8, request.method, "GET") and std.mem.eql(u8, request.path, "/api/admin/assets")) {
        const body = try buildAssetsResponse(allocator, false, "");
        defer allocator.free(body);
        try sendBytes(fd, 200, "OK", "application/json; charset=utf-8", "no-store", body, null);
        return;
    }

    if (std.mem.eql(u8, request.method, "GET") and std.mem.eql(u8, request.path, "/api/admin/site")) {
        const body = try buildSiteEditor(allocator);
        defer allocator.free(body);
        try sendBytes(fd, 200, "OK", "application/json; charset=utf-8", "no-store", body, null);
        return;
    }

    if (std.mem.eql(u8, request.method, "POST") and std.mem.eql(u8, request.path, "/api/admin/assets")) {
        const body = try writeTutorialAsset(allocator, request.body);
        defer allocator.free(body);
        try sendBytes(fd, 200, "OK", "application/json; charset=utf-8", "no-store", body, null);
        return;
    }

    if (std.mem.eql(u8, request.method, "PUT") and std.mem.eql(u8, request.path, "/api/admin/site/hero-carousel")) {
        try writeHeroCarousel(allocator, request.body);
        const body = try buildSiteEditor(allocator);
        defer allocator.free(body);
        try sendBytes(fd, 200, "OK", "application/json; charset=utf-8", "no-store", body, null);
        return;
    }

    const prefix = "/api/admin/tutorials/";
    if (std.mem.startsWith(u8, request.path, prefix)) {
        const id = try sanitizePathPart(allocator, request.path[prefix.len..]);
        defer allocator.free(id);

        if (std.mem.eql(u8, request.method, "GET")) {
            const body = buildAdminTutorialDetail(allocator, id) catch {
                try sendJsonError(fd, 404, "Tutorial not found");
                return;
            };
            defer allocator.free(body);
            try sendBytes(fd, 200, "OK", "application/json; charset=utf-8", "no-store", body, null);
            return;
        }

        if (std.mem.eql(u8, request.method, "PUT")) {
            try writeTutorialDetail(allocator, id, request.body);
            const body = try buildAdminTutorialDetail(allocator, id);
            defer allocator.free(body);
            try sendBytes(fd, 200, "OK", "application/json; charset=utf-8", "no-store", body, null);
            return;
        }

        if (std.mem.eql(u8, request.method, "DELETE")) {
            try deleteTutorialDetail(allocator, id);
            const body = try buildAdminTutorialIndex(allocator);
            defer allocator.free(body);
            try sendBytes(fd, 200, "OK", "application/json; charset=utf-8", "no-store", body, null);
            return;
        }
    }

    try sendJsonError(fd, 404, "Admin API route not found");
}

fn handleStatic(allocator: Allocator, fd: c_int, request: Request) !void {
    const decoded_path = try percentDecode(allocator, request.path);
    defer allocator.free(decoded_path);

    if (!isSafeUrlPath(decoded_path)) {
        try sendJsonError(fd, 403, "Forbidden");
        return;
    }

    if (std.mem.startsWith(u8, decoded_path, "/assets/tutorials/")) {
        const file_path = try joinUrlPath(allocator, public_root, decoded_path);
        defer allocator.free(file_path);
        if (try serveFileIfExists(allocator, fd, request, file_path, "public, max-age=300")) return;
    }

    const dist_path = try joinUrlPath(allocator, dist_root, if (std.mem.eql(u8, decoded_path, "/")) "/index.html" else decoded_path);
    defer allocator.free(dist_path);
    if (try serveFileIfExists(allocator, fd, request, dist_path, "public, max-age=31536000, immutable")) return;

    if (hasExtension(decoded_path)) {
        try sendJsonError(fd, 404, "File not found");
        return;
    }

    const index = try readFileAlloc(allocator, dist_root ++ "/index.html", 10 * 1024 * 1024);
    defer allocator.free(index);
    try sendBytes(fd, 200, "OK", "text/html; charset=utf-8", "no-cache", if (std.mem.eql(u8, request.method, "HEAD")) "" else index, null);
}

fn buildTutorialContentIndex(allocator: Allocator, admin_names: bool) ![]u8 {
    const tutorials = try readFileAlloc(allocator, tutorials_path, 20 * 1024 * 1024);
    defer allocator.free(tutorials);
    const categories = try readFileAlloc(allocator, categories_path, 5 * 1024 * 1024);
    defer allocator.free(categories);
    const subcategories = try readFileAlloc(allocator, subcategories_path, 5 * 1024 * 1024);
    defer allocator.free(subcategories);

    var aw: std.Io.Writer.Allocating = .init(allocator);
    errdefer aw.deinit();
    const w = &aw.writer;
    try w.writeAll("{\"tutorials\":");
    try w.writeAll(tutorials);
    if (admin_names) {
        try w.writeAll(",\"categories\":");
        try w.writeAll(categories);
        try w.writeAll(",\"subcategories\":");
        try w.writeAll(subcategories);
    } else {
        try w.writeAll(",\"tutorialCategories\":");
        try w.writeAll(categories);
        try w.writeAll(",\"tutorialSubcategories\":");
        try w.writeAll(subcategories);
    }
    try w.writeAll("}");
    return aw.toOwnedSlice();
}

fn buildAdminTutorialIndex(allocator: Allocator) ![]u8 {
    return buildTutorialContentIndex(allocator, true);
}

fn buildTutorialContentDetail(allocator: Allocator, slug: []const u8) ![]u8 {
    var tutorials_parsed = try parseJsonFile(allocator, tutorials_path);
    defer tutorials_parsed.deinit();
    const tutorial = findTutorial(tutorials_parsed.value, "slug", slug) orelse return error.NotFound;
    const id = getObjectString(tutorial.*, "id") orelse return error.NotFound;

    const tutorials_raw = try readFileAlloc(allocator, tutorials_path, 20 * 1024 * 1024);
    defer allocator.free(tutorials_raw);
    const categories = try readFileAlloc(allocator, categories_path, 5 * 1024 * 1024);
    defer allocator.free(categories);
    const subcategories = try readFileAlloc(allocator, subcategories_path, 5 * 1024 * 1024);
    defer allocator.free(subcategories);
    var samples_parsed = try parseJsonFile(allocator, samples_path);
    defer samples_parsed.deinit();
    const sample = getSample(samples_parsed.value, id);
    const script_path = try std.fmt.allocPrint(allocator, "{s}/{s}.txt", .{ scripts_root, id });
    defer allocator.free(script_path);
    const script = readTextIfExists(allocator, script_path) catch "";
    defer if (script.len > 0) allocator.free(script);

    var aw: std.Io.Writer.Allocating = .init(allocator);
    errdefer aw.deinit();
    const w = &aw.writer;
    try w.writeAll("{\"tutorials\":");
    try w.writeAll(tutorials_raw);
    try w.writeAll(",\"tutorialCategories\":");
    try w.writeAll(categories);
    try w.writeAll(",\"tutorialSubcategories\":");
    try w.writeAll(subcategories);
    try w.writeAll(",\"sample\":");
    try writeJsonValue(w, sample);
    try w.writeAll(",\"script\":");
    try writeJsonString(w, script);
    try w.writeAll(",\"tutorial\":");
    try writeJsonValue(w, tutorial.*);
    try w.writeAll("}");
    return aw.toOwnedSlice();
}

fn buildAdminTutorialDetail(allocator: Allocator, id: []const u8) ![]u8 {
    var tutorials_parsed = try parseJsonFile(allocator, tutorials_path);
    defer tutorials_parsed.deinit();
    const tutorial = findTutorial(tutorials_parsed.value, "id", id) orelse return error.NotFound;
    var samples_parsed = try parseJsonFile(allocator, samples_path);
    defer samples_parsed.deinit();
    const sample = getSample(samples_parsed.value, id);
    const script_path = try std.fmt.allocPrint(allocator, "{s}/{s}.txt", .{ scripts_root, id });
    defer allocator.free(script_path);
    const script = readTextIfExists(allocator, script_path) catch "";
    defer if (script.len > 0) allocator.free(script);
    const assets = try buildAssetsArray(allocator);
    defer allocator.free(assets);

    var aw: std.Io.Writer.Allocating = .init(allocator);
    errdefer aw.deinit();
    const w = &aw.writer;
    try w.writeAll("{\"tutorial\":");
    try writeJsonValue(w, tutorial.*);
    try w.writeAll(",\"sample\":");
    try writeJsonValue(w, sample);
    try w.writeAll(",\"script\":");
    try writeJsonString(w, script);
    try w.writeAll(",\"assets\":");
    try w.writeAll(assets);
    try w.writeAll("}");
    return aw.toOwnedSlice();
}

fn buildSiteEditor(allocator: Allocator) ![]u8 {
    var site_parsed = try parseJsonFile(allocator, site_base_path);
    defer site_parsed.deinit();
    const hero = if (site_parsed.value == .object) site_parsed.value.object.get("heroCarousel") else null;
    const assets = try buildAssetsArray(allocator);
    defer allocator.free(assets);

    var aw: std.Io.Writer.Allocating = .init(allocator);
    errdefer aw.deinit();
    const w = &aw.writer;
    try w.writeAll("{\"heroCarousel\":");
    if (hero) |value| try writeJsonValue(w, value) else try w.writeAll("[]");
    try w.writeAll(",\"assets\":");
    try w.writeAll(assets);
    try w.writeAll("}");
    return aw.toOwnedSlice();
}

fn buildAssetsResponse(allocator: Allocator, include_url: bool, url: []const u8) ![]u8 {
    const assets = try buildAssetsArray(allocator);
    defer allocator.free(assets);
    var aw: std.Io.Writer.Allocating = .init(allocator);
    errdefer aw.deinit();
    const w = &aw.writer;
    try w.writeAll("{");
    if (include_url) {
        try w.writeAll("\"url\":");
        try writeJsonString(w, url);
        try w.writeAll(",");
    }
    try w.writeAll("\"assets\":");
    try w.writeAll(assets);
    try w.writeAll("}");
    return aw.toOwnedSlice();
}

fn buildAssetsArray(allocator: Allocator) ![]u8 {
    var aw: std.Io.Writer.Allocating = .init(allocator);
    errdefer aw.deinit();
    const w = &aw.writer;
    try w.writeAll("[");
    var first = true;
    try walkAssets(allocator, w, tutorial_assets_root, "", &first);
    try w.writeAll("]");
    return aw.toOwnedSlice();
}

fn walkAssets(allocator: Allocator, w: *std.Io.Writer, root: []const u8, rel: []const u8, first: *bool) !void {
    const dir_path = if (rel.len == 0) try allocator.dupe(u8, root) else try std.fmt.allocPrint(allocator, "{s}/{s}", .{ root, rel });
    defer allocator.free(dir_path);
    const c_path = try nullTerminate(allocator, dir_path);
    defer allocator.free(c_path);
    const dir = c.opendir(c_path.ptr) orelse return;
    defer _ = c.closedir(dir);

    while (c.readdir(dir)) |entry| {
        const name = std.mem.span(@as([*:0]const u8, @ptrCast(&entry.*.d_name)));
        if (std.mem.eql(u8, name, ".") or std.mem.eql(u8, name, "..")) continue;
        const next_rel = if (rel.len == 0) try allocator.dupe(u8, name) else try std.fmt.allocPrint(allocator, "{s}/{s}", .{ rel, name });
        defer allocator.free(next_rel);
        const full_path = try std.fmt.allocPrint(allocator, "{s}/{s}", .{ root, next_rel });
        defer allocator.free(full_path);
        if (isDirectory(full_path)) {
            try walkAssets(allocator, w, root, next_rel, first);
        } else if (isRegularFile(full_path)) {
            if (!first.*) try w.writeAll(",");
            first.* = false;
            const url = try std.fmt.allocPrint(allocator, "/assets/tutorials/{s}", .{next_rel});
            defer allocator.free(url);
            try w.writeAll("{\"url\":");
            try writeJsonString(w, url);
            try w.writeAll(",\"name\":");
            try writeJsonString(w, name);
            try w.writeAll(",\"type\":");
            try writeJsonString(w, assetType(name));
            try w.writeAll("}");
        }
    }
}

fn writeTutorialDetail(allocator: Allocator, id: []const u8, body: []const u8) !void {
    var parsed = try std.json.parseFromSlice(JsonValue, allocator, body, .{});
    defer parsed.deinit();
    if (parsed.value != .object) return error.BadPayload;
    const tutorial = parsed.value.object.get("tutorial") orelse return error.BadPayload;
    const sample = parsed.value.object.get("sample") orelse JsonValue{ .object = .empty };
    const script = if (parsed.value.object.get("script")) |v| switch (v) {
        .string => |s| s,
        else => "",
    } else "";
    const tutorial_id = getObjectString(tutorial, "id") orelse return error.BadPayload;
    if (!std.mem.eql(u8, tutorial_id, id)) return error.BadPayload;

    try replaceTutorialInFile(allocator, id, tutorial);
    try replaceSampleInFile(allocator, id, sample);
    try ensureDir(scripts_root);
    const script_path = try std.fmt.allocPrint(allocator, "{s}/{s}.txt", .{ scripts_root, id });
    defer allocator.free(script_path);
    const script_with_newline = try std.fmt.allocPrint(allocator, "{s}\n", .{std.mem.trimEnd(u8, script, "\r\n")});
    defer allocator.free(script_with_newline);
    try writeFile(script_path, script_with_newline);
}

fn replaceTutorialInFile(allocator: Allocator, id: []const u8, replacement: JsonValue) !void {
    var parsed = try parseJsonFile(allocator, tutorials_path);
    defer parsed.deinit();
    if (parsed.value != .array) return error.BadJson;

    var aw: std.Io.Writer.Allocating = .init(allocator);
    defer aw.deinit();
    const w = &aw.writer;
    try w.writeAll("[\n");
    var found = false;
    for (parsed.value.array.items, 0..) |item, index| {
        if (index > 0) try w.writeAll(",\n");
        if (std.mem.eql(u8, getObjectString(item, "id") orelse "", id)) {
            try writePrettyJsonValue(w, replacement);
            found = true;
        } else {
            try writePrettyJsonValue(w, item);
        }
    }
    try w.writeAll("\n]\n");
    if (!found) return error.NotFound;
    try writeFile(tutorials_path, aw.written());
}

fn replaceSampleInFile(allocator: Allocator, id: []const u8, replacement: JsonValue) !void {
    var parsed = try parseJsonFile(allocator, samples_path);
    defer parsed.deinit();
    if (parsed.value != .object) return error.BadJson;

    var aw: std.Io.Writer.Allocating = .init(allocator);
    defer aw.deinit();
    const w = &aw.writer;
    try w.writeAll("{\n");
    var first = true;
    var inserted = false;
    var it = parsed.value.object.iterator();
    while (it.next()) |entry| {
        if (std.mem.eql(u8, entry.key_ptr.*, id)) {
            if (!first) try w.writeAll(",\n");
            first = false;
            try writeJsonString(w, id);
            try w.writeAll(": ");
            try writePrettyJsonValue(w, replacement);
            inserted = true;
            continue;
        }
        if (!first) try w.writeAll(",\n");
        first = false;
        try writeJsonString(w, entry.key_ptr.*);
        try w.writeAll(": ");
        try writePrettyJsonValue(w, entry.value_ptr.*);
    }
    if (!inserted) {
        if (!first) try w.writeAll(",\n");
        try writeJsonString(w, id);
        try w.writeAll(": ");
        try writePrettyJsonValue(w, replacement);
    }
    try w.writeAll("\n}\n");
    try writeFile(samples_path, aw.written());
}

fn deleteTutorialDetail(allocator: Allocator, id: []const u8) !void {
    var tutorials_parsed = try parseJsonFile(allocator, tutorials_path);
    defer tutorials_parsed.deinit();
    if (tutorials_parsed.value != .array) return error.BadJson;

    var aw: std.Io.Writer.Allocating = .init(allocator);
    defer aw.deinit();
    const w = &aw.writer;
    try w.writeAll("[\n");
    var first = true;
    var found = false;
    for (tutorials_parsed.value.array.items) |item| {
        if (std.mem.eql(u8, getObjectString(item, "id") orelse "", id)) {
            found = true;
            continue;
        }
        removeRelatedId(&item, id);
        if (!first) try w.writeAll(",\n");
        first = false;
        try writePrettyJsonValue(w, item);
    }
    try w.writeAll("\n]\n");
    if (!found) return error.NotFound;
    try writeFile(tutorials_path, aw.written());

    var samples_parsed = try parseJsonFile(allocator, samples_path);
    defer samples_parsed.deinit();
    if (samples_parsed.value != .object) return;
    var sw: std.Io.Writer.Allocating = .init(allocator);
    defer sw.deinit();
    const sample_w = &sw.writer;
    try sample_w.writeAll("{\n");
    first = true;
    var it = samples_parsed.value.object.iterator();
    while (it.next()) |entry| {
        if (std.mem.eql(u8, entry.key_ptr.*, id)) continue;
        if (!first) try sample_w.writeAll(",\n");
        first = false;
        try writeJsonString(sample_w, entry.key_ptr.*);
        try sample_w.writeAll(": ");
        try writePrettyJsonValue(sample_w, entry.value_ptr.*);
    }
    try sample_w.writeAll("\n}\n");
    try writeFile(samples_path, sw.written());
    const script_path = try std.fmt.allocPrint(allocator, "{s}/{s}.txt", .{ scripts_root, id });
    defer allocator.free(script_path);
    deleteFile(script_path);
}

fn removeRelatedId(item: *const JsonValue, id: []const u8) void {
    if (item.* != .object) return;
    const related = item.object.getPtr("relatedTutorialIds") orelse return;
    if (related.* != .array) return;
    var i: usize = 0;
    while (i < related.array.items.len) {
        const value = related.array.items[i];
        if (value == .string and std.mem.eql(u8, value.string, id)) {
            _ = related.array.orderedRemove(i);
        } else {
            i += 1;
        }
    }
}

fn writeHeroCarousel(allocator: Allocator, body: []const u8) !void {
    var payload = try std.json.parseFromSlice(JsonValue, allocator, body, .{});
    defer payload.deinit();
    const hero = if (payload.value == .object) payload.value.object.get("heroCarousel") else null;
    if (hero == null or hero.? != .array) return error.BadPayload;

    var site = try parseJsonFile(allocator, site_base_path);
    defer site.deinit();
    if (site.value != .object) return error.BadJson;

    var aw: std.Io.Writer.Allocating = .init(allocator);
    defer aw.deinit();
    const w = &aw.writer;
    try w.writeAll("{\n");
    var first = true;
    var wrote_hero = false;
    var it = site.value.object.iterator();
    while (it.next()) |entry| {
        if (!first) try w.writeAll(",\n");
        first = false;
        try writeJsonString(w, entry.key_ptr.*);
        try w.writeAll(": ");
        if (std.mem.eql(u8, entry.key_ptr.*, "heroCarousel")) {
            try writePrettyJsonValue(w, hero.?);
            wrote_hero = true;
        } else {
            try writePrettyJsonValue(w, entry.value_ptr.*);
        }
    }
    if (!wrote_hero) {
        if (!first) try w.writeAll(",\n");
        try w.writeAll("\"heroCarousel\": ");
        try writePrettyJsonValue(w, hero.?);
    }
    try w.writeAll("\n}\n");
    try writeFile(site_base_path, aw.written());
}

fn writeTutorialAsset(allocator: Allocator, body: []const u8) ![]u8 {
    var parsed = try std.json.parseFromSlice(JsonValue, allocator, body, .{});
    defer parsed.deinit();
    if (parsed.value != .object) return error.BadPayload;
    const folder_raw = getObjectString(parsed.value, "folder") orelse "uploads";
    const file_raw = getObjectString(parsed.value, "fileName") orelse "asset.bin";
    const base64_raw = getObjectString(parsed.value, "base64") orelse return error.BadPayload;
    const folder = try sanitizeAssetPath(allocator, folder_raw);
    defer allocator.free(folder);
    const file_name = try sanitizeFileName(allocator, file_raw);
    defer allocator.free(file_name);
    const target_dir = try std.fmt.allocPrint(allocator, "{s}/{s}", .{ tutorial_assets_root, folder });
    defer allocator.free(target_dir);
    try ensureDir(target_dir);
    const target_path = try std.fmt.allocPrint(allocator, "{s}/{s}", .{ target_dir, file_name });
    defer allocator.free(target_path);

    const decoder = std.base64.standard.Decoder;
    const decoded_len = try decoder.calcSizeForSlice(base64_raw);
    const decoded = try allocator.alloc(u8, decoded_len);
    defer allocator.free(decoded);
    try decoder.decode(decoded, base64_raw);
    try writeFile(target_path, decoded);

    const url = try std.fmt.allocPrint(allocator, "/assets/tutorials/{s}/{s}", .{ folder, file_name });
    defer allocator.free(url);
    return buildAssetsResponse(allocator, true, url);
}

fn authorize(fd: c_int, request: Request, expected: []const u8) !bool {
    if (expected.len == 0) return true;
    const actual = request.header("authorization") orelse "";
    if (std.mem.eql(u8, actual, expected)) return true;
    try sendBytes(fd, 401, "Unauthorized", "text/plain; charset=utf-8", "no-store", "Authentication required", "WWW-Authenticate: Basic realm=\"SceneMax Admin\", charset=\"UTF-8\"\r\n");
    return false;
}

fn serveFileIfExists(allocator: Allocator, fd: c_int, request: Request, file_path: []const u8, cache_control: []const u8) !bool {
    if (!isRegularFile(file_path)) return false;
    const content = try readFileAlloc(allocator, file_path, 1024 * 1024 * 1024);
    defer allocator.free(content);
    try sendBytes(fd, 200, "OK", mimeType(file_path), cache_control, if (std.mem.eql(u8, request.method, "HEAD")) "" else content, null);
    return true;
}

fn sendJsonError(fd: c_int, status: u16, message: []const u8) !void {
    var aw: std.Io.Writer.Allocating = .init(std.heap.page_allocator);
    defer aw.deinit();
    try aw.writer.writeAll("{\"error\":");
    try writeJsonString(&aw.writer, message);
    try aw.writer.writeAll("}");
    try sendBytes(fd, status, reasonPhrase(status), "application/json; charset=utf-8", "no-store", aw.written(), null);
}

fn sendBytes(fd: c_int, status: u16, reason: []const u8, content_type: []const u8, cache_control: []const u8, body: []const u8, extra_headers: ?[]const u8) !void {
    var aw: std.Io.Writer.Allocating = .init(std.heap.page_allocator);
    defer aw.deinit();
    try aw.writer.print("HTTP/1.1 {d} {s}\r\nContent-Type: {s}\r\nCache-Control: {s}\r\nContent-Length: {d}\r\nConnection: close\r\n", .{ status, reason, content_type, cache_control, body.len });
    if (extra_headers) |headers| try aw.writer.writeAll(headers);
    try aw.writer.writeAll("\r\n");
    try sendAll(fd, aw.written());
    if (body.len > 0) try sendAll(fd, body);
}

fn sendAll(fd: c_int, data: []const u8) !void {
    var sent: usize = 0;
    while (sent < data.len) {
        const n = c.send(fd, data.ptr + sent, data.len - sent, 0x4000);
        if (n <= 0) return error.SendFailed;
        sent += @intCast(n);
    }
}

fn parseJsonFile(allocator: Allocator, path: []const u8) !std.json.Parsed(JsonValue) {
    const text = try readFileAlloc(allocator, path, 50 * 1024 * 1024);
    defer allocator.free(text);
    return std.json.parseFromSlice(JsonValue, allocator, text, .{});
}

fn findTutorial(root: JsonValue, field: []const u8, expected: []const u8) ?*const JsonValue {
    if (root != .array) return null;
    for (root.array.items) |*item| {
        const actual = getObjectString(item.*, field) orelse continue;
        if (std.mem.eql(u8, actual, expected)) return item;
    }
    return null;
}

fn getSample(samples: JsonValue, id: []const u8) JsonValue {
    if (samples == .object) {
        if (samples.object.get(id)) |sample| return sample;
    }
    var object: std.json.ObjectMap = .empty;
    object.put(std.heap.page_allocator, "language", JsonValue{ .string = "scenemax" }) catch {};
    object.put(std.heap.page_allocator, "caption", JsonValue{ .string = "" }) catch {};
    object.put(std.heap.page_allocator, "code", JsonValue{ .string = "" }) catch {};
    return JsonValue{ .object = object };
}

fn getObjectString(value: JsonValue, key: []const u8) ?[]const u8 {
    if (value != .object) return null;
    const field = value.object.get(key) orelse return null;
    return switch (field) {
        .string => |s| s,
        else => null,
    };
}

fn writeJsonValue(w: *std.Io.Writer, value: JsonValue) !void {
    try std.json.Stringify.value(value, .{}, w);
}

fn writePrettyJsonValue(w: *std.Io.Writer, value: JsonValue) !void {
    try std.json.Stringify.value(value, .{ .whitespace = .indent_2 }, w);
}

fn writeJsonString(w: *std.Io.Writer, value: []const u8) !void {
    try std.json.Stringify.value(value, .{}, w);
}

fn readFileAlloc(allocator: Allocator, path: []const u8, max_size: usize) ![]u8 {
    const c_path = try nullTerminate(allocator, path);
    defer allocator.free(c_path);
    const file = c.fopen(c_path.ptr, "rb") orelse return error.FileNotFound;
    defer _ = c.fclose(file);
    if (c.fseek(file, 0, c.SEEK_END) != 0) return error.FileReadFailed;
    const raw_len = c.ftell(file);
    if (raw_len < 0) return error.FileReadFailed;
    if (@as(usize, @intCast(raw_len)) > max_size) return error.FileTooLarge;
    if (c.fseek(file, 0, c.SEEK_SET) != 0) return error.FileReadFailed;
    const len: usize = @intCast(raw_len);
    const data = try allocator.alloc(u8, len);
    const read = c.fread(data.ptr, 1, len, file);
    if (read != len) return error.FileReadFailed;
    return data;
}

fn writeFile(path: []const u8, data: []const u8) !void {
    const c_path = try nullTerminate(std.heap.page_allocator, path);
    defer std.heap.page_allocator.free(c_path);
    const file = c.fopen(c_path.ptr, "wb") orelse return error.FileWriteFailed;
    defer _ = c.fclose(file);
    if (data.len > 0 and c.fwrite(data.ptr, 1, data.len, file) != data.len) return error.FileWriteFailed;
}

fn readTextIfExists(allocator: Allocator, path: []const u8) ![]u8 {
    return readFileAlloc(allocator, path, 50 * 1024 * 1024) catch |err| switch (err) {
        error.FileNotFound => try allocator.dupe(u8, ""),
        else => err,
    };
}

fn deleteFile(path: []const u8) void {
    const c_path = nullTerminate(std.heap.page_allocator, path) catch return;
    defer std.heap.page_allocator.free(c_path);
    _ = c.unlink(c_path.ptr);
}

fn isRegularFile(path: []const u8) bool {
    const c_path = nullTerminate(std.heap.page_allocator, path) catch return false;
    defer std.heap.page_allocator.free(c_path);
    if (isDirectory(path)) return false;
    const file = c.fopen(c_path.ptr, "rb") orelse return false;
    _ = c.fclose(file);
    return true;
}

fn isDirectory(path: []const u8) bool {
    const c_path = nullTerminate(std.heap.page_allocator, path) catch return false;
    defer std.heap.page_allocator.free(c_path);
    const dir = c.opendir(c_path.ptr) orelse return false;
    _ = c.closedir(dir);
    return true;
}

fn ensureDir(path: []const u8) !void {
    var cursor: usize = 0;
    while (cursor <= path.len) {
        const next = std.mem.indexOfScalarPos(u8, path, cursor, '/') orelse path.len;
        if (next > 0) {
            const part = path[0..next];
            const c_part = try nullTerminate(std.heap.page_allocator, part);
            defer std.heap.page_allocator.free(c_part);
            if (c.mkdir(c_part.ptr, 0o755) != 0 and !isDirectory(part)) return error.MkdirFailed;
        }
        if (next == path.len) break;
        cursor = next + 1;
    }
}

fn nullTerminate(allocator: Allocator, value: []const u8) ![:0]u8 {
    const out = try allocator.allocSentinel(u8, value.len, 0);
    @memcpy(out[0..value.len], value);
    return out;
}

fn joinUrlPath(allocator: Allocator, root: []const u8, path: []const u8) ![]u8 {
    const trimmed = if (path.len > 0 and path[0] == '/') path[1..] else path;
    return std.fmt.allocPrint(allocator, "{s}/{s}", .{ root, trimmed });
}

fn isSafeUrlPath(path: []const u8) bool {
    if (std.mem.indexOf(u8, path, "..") != null) return false;
    if (std.mem.indexOfScalar(u8, path, '\\') != null) return false;
    return true;
}

fn hasExtension(path: []const u8) bool {
    const slash = std.mem.lastIndexOfScalar(u8, path, '/') orelse 0;
    const dot = std.mem.lastIndexOfScalar(u8, path, '.') orelse return false;
    return dot > slash;
}

fn percentDecode(allocator: Allocator, value: []const u8) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(allocator);
    var i: usize = 0;
    while (i < value.len) {
        if (value[i] == '%' and i + 2 < value.len) {
            const byte = std.fmt.parseUnsigned(u8, value[i + 1 .. i + 3], 16) catch {
                try out.append(allocator, value[i]);
                i += 1;
                continue;
            };
            try out.append(allocator, byte);
            i += 3;
        } else {
            try out.append(allocator, value[i]);
            i += 1;
        }
    }
    return out.toOwnedSlice(allocator);
}

fn sanitizePathPart(allocator: Allocator, value: []const u8) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(allocator);
    for (value) |ch| {
        if (std.ascii.isAlphanumeric(ch) or ch == '-') try out.append(allocator, ch);
    }
    return out.toOwnedSlice(allocator);
}

fn sanitizeFileName(allocator: Allocator, value: []const u8) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(allocator);
    for (value) |ch| {
        if (std.ascii.isAlphanumeric(ch) or ch == '.' or ch == '_' or ch == '-') {
            try out.append(allocator, ch);
        } else {
            try out.append(allocator, '-');
        }
    }
    return out.toOwnedSlice(allocator);
}

fn sanitizeAssetPath(allocator: Allocator, value: []const u8) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(allocator);
    var parts = std.mem.tokenizeAny(u8, value, "/\\");
    var first = true;
    while (parts.next()) |part| {
        const clean = try sanitizeFileName(allocator, part);
        defer allocator.free(clean);
        if (clean.len == 0) continue;
        if (!first) try out.append(allocator, '/');
        first = false;
        try out.appendSlice(allocator, clean);
    }
    if (out.items.len == 0) try out.appendSlice(allocator, "uploads");
    return out.toOwnedSlice(allocator);
}

fn makeBasicAuthHeader(allocator: Allocator, user: []const u8, password: []const u8) ![]u8 {
    const credentials = try std.fmt.allocPrint(allocator, "{s}:{s}", .{ user, password });
    defer allocator.free(credentials);
    const encoded_len = std.base64.standard.Encoder.calcSize(credentials.len);
    const encoded = try allocator.alloc(u8, encoded_len);
    defer allocator.free(encoded);
    _ = std.base64.standard.Encoder.encode(encoded, credentials);
    return std.fmt.allocPrint(allocator, "Basic {s}", .{encoded});
}

fn getEnv(name: [:0]const u8) []const u8 {
    const value = c.getenv(name.ptr) orelse return "";
    return std.mem.span(value);
}

fn getEnvInt(name: [:0]const u8, fallback: u16) u16 {
    const value = getEnv(name);
    if (value.len == 0) return fallback;
    return std.fmt.parseUnsigned(u16, value, 10) catch fallback;
}

fn mimeType(path: []const u8) []const u8 {
    if (std.mem.endsWith(u8, path, ".html")) return "text/html; charset=utf-8";
    if (std.mem.endsWith(u8, path, ".css")) return "text/css; charset=utf-8";
    if (std.mem.endsWith(u8, path, ".js")) return "text/javascript; charset=utf-8";
    if (std.mem.endsWith(u8, path, ".json")) return "application/json; charset=utf-8";
    if (std.mem.endsWith(u8, path, ".svg")) return "image/svg+xml; charset=utf-8";
    if (std.mem.endsWith(u8, path, ".png")) return "image/png";
    if (std.mem.endsWith(u8, path, ".jpg") or std.mem.endsWith(u8, path, ".jpeg")) return "image/jpeg";
    if (std.mem.endsWith(u8, path, ".gif")) return "image/gif";
    if (std.mem.endsWith(u8, path, ".webp")) return "image/webp";
    if (std.mem.endsWith(u8, path, ".mp4")) return "video/mp4";
    if (std.mem.endsWith(u8, path, ".webm")) return "video/webm";
    if (std.mem.endsWith(u8, path, ".woff")) return "font/woff";
    if (std.mem.endsWith(u8, path, ".woff2")) return "font/woff2";
    if (std.mem.endsWith(u8, path, ".txt")) return "text/plain; charset=utf-8";
    return "application/octet-stream";
}

fn assetType(name: []const u8) []const u8 {
    if (std.mem.endsWith(u8, name, ".png") or std.mem.endsWith(u8, name, ".jpg") or std.mem.endsWith(u8, name, ".jpeg") or std.mem.endsWith(u8, name, ".gif") or std.mem.endsWith(u8, name, ".webp") or std.mem.endsWith(u8, name, ".svg")) return "image";
    if (std.mem.endsWith(u8, name, ".mp4") or std.mem.endsWith(u8, name, ".webm") or std.mem.endsWith(u8, name, ".mov")) return "video";
    return "other";
}

fn reasonPhrase(status: u16) []const u8 {
    return switch (status) {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        else => "Internal Server Error",
    };
}
