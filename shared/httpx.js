/**
 * shared/httpx.js
 * Tiện ích chuẩn hóa phản hồi HTTP JSON cho các RESTful API trong hệ thống HTQLNS
 */

function success(res, data = null, statusCode = 200, message = 'Thành công') {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

function created(res, data = null, message = 'Tạo mới thành công') {
  return success(res, data, 201, message);
}

function error(res, message = 'Lỗi máy chủ', statusCode = 500, details = null) {
  return res.status(statusCode).json({
    success: false,
    error: message,
    code: statusCode,
    ...(details ? { details } : {})
  });
}

function badRequest(res, message = 'Dữ liệu yêu cầu không hợp lệ', details = null) {
  return error(res, message, 400, details);
}

function unauthorized(res, message = 'Yêu cầu xác thực tài khoản (Unauthorized)') {
  return error(res, message, 401);
}

function forbidden(res, message = 'Không có quyền truy cập (Forbidden)') {
  return error(res, message, 403);
}

function notFound(res, message = 'Không tìm thấy tài nguyên yêu cầu (Not Found)') {
  return error(res, message, 404);
}

function conflict(res, message = 'Dữ liệu xung đột hoặc đã tồn tại (Conflict)') {
  return error(res, message, 409);
}

module.exports = {
  success,
  created,
  error,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict
};
