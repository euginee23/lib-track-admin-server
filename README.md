# Library Tracker Admin Server

A Node.js/Express.js backend server for the Library Tracker Admin application.

## Features

- **RESTful API** for books and research papers management
- **Dashboard analytics** with statistics and charts data
- **CORS enabled** for frontend integration
- **Security middleware** with Helmet
- **Request logging** with Morgan
- **Environment configuration** with dotenv
- **Error handling** and validation

## API Endpoints

### Books
- `GET /api/books` - Get all books (with pagination and search)
- `GET /api/books/:id` - Get a specific book
- `POST /api/books` - Create a new book
- `PUT /api/books/:id` - Update a book
- `DELETE /api/books/:id` - Delete a book
- `DELETE /api/books` - Delete multiple books

### Research Papers
- `GET /api/research` - Get all research papers (with pagination and search)
- `GET /api/research/:id` - Get a specific research paper
- `POST /api/research` - Create a new research paper
- `PUT /api/research/:id` - Update a research paper
- `DELETE /api/research/:id` - Delete a research paper
- `DELETE /api/research` - Delete multiple research papers

### Dashboard
- `GET /api/dashboard/stats` - Get comprehensive dashboard statistics
- `GET /api/dashboard/summary` - Get summary data for dashboard cards
- `GET /api/dashboard/charts` - Get data for dashboard charts

### System
- `GET /` - Server information
- `GET /health` - Health check endpoint

## Setup and Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment setup:**
   - Copy `.env.example` to `.env` if needed
   - Configure environment variables as required

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Start production server:**
   ```bash
   npm start
   ```

## Environment Variables

- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment (development/production)
- `CORS_ORIGIN` - Allowed CORS origin (default: http://localhost:3000)
- `MAX_FILE_SIZE` - Maximum file upload size (default: 10mb)

## Response Format

All API responses follow this format:

```json
{
  "success": true|false,
  "data": {...},
  "message": "Optional message",
  "error": "Error message if success is false",
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

## Error Handling

The server includes comprehensive error handling:
- 400 for validation errors
- 404 for not found resources
- 500 for server errors
- Global error handler for uncaught exceptions

## Development

- Uses `nodemon` for auto-restart during development
- Includes request logging for debugging
- Environment-based error message verbosity

## Security

- Helmet.js for security headers
- CORS configuration
- Input validation and sanitization
- Error message sanitization in production

## Future Enhancements

- Database integration (PostgreSQL/MongoDB)
- Authentication and authorization
- File upload handling for book covers
- Advanced search and filtering
- Data export functionality
- Rate limiting
- API documentation with Swagger

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request
